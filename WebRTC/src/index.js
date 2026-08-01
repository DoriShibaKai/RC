import { DurableObject } from "cloudflare:workers";

/*
 * 通常のWebページへのアクセスと，
 * WebRTC接続に必要なメッセージの受け渡しを振り分けます。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // /ws/部屋名 へのアクセスだけを接続用として処理
    if (url.pathname.startsWith("/ws/")) {
      const roomName = decodeURIComponent(
        url.pathname.slice("/ws/".length)
      ).trim();

      if (!roomName) {
        return new Response(
          "部屋名がありません。",
          {
            status: 400
          }
        );
      }

      // 同じ部屋名の利用者を，同じ接続場所へ案内
      const id = env.ROOMS.idFromName(roomName);
      const room = env.ROOMS.get(id);

      return room.fetch(request);
    }

    // それ以外はWebページを表示
    return env.ASSETS.fetch(request);
  }
};

/*
 * 同じ部屋に入ったiPhoneとPCの間で，
 * WebRTC接続用の情報を中継します。
 */
export class SignalingRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  /*
   * WebSocketに保存されている接続情報を取得する。
   */
  getSocketState(socket) {
    try {
      return socket.deserializeAttachment() || {};
    } catch {
      return {};
    }
  }

  /*
   * WebSocketへ接続情報を保存する。
   */
  setSocketState(socket, state) {
    try {
      socket.serializeAttachment(state);
    } catch {
      // 保存できなかった場合は，後続処理を継続する
    }
  }

  /*
   * 指定したWebSocketを安全に閉じる。
   */
  closeSocketSafely(
    socket,
    code = 1000,
    reason = "Connection closed"
  ) {
    try {
      socket.close(code, reason);
    } catch {
      // すでに閉じている場合は無視
    }
  }

  async fetch(request) {
    const upgradeHeader =
      request.headers.get("Upgrade");

    if (
      upgradeHeader?.toLowerCase() !==
      "websocket"
    ) {
      return new Response(
        "WebSocket接続専用です。",
        {
          status: 426
        }
      );
    }

    const url = new URL(request.url);

    /*
     * HTML側から，
     *
     * sender
     * viewer
     *
     * のどちらで接続するかを受け取る。
     */
    const requestedRole =
      url.searchParams.get("role");

    if (
      requestedRole !== "sender" &&
      requestedRole !== "viewer"
    ) {
      return new Response(
        "接続役割が正しくありません。",
        {
          status: 400
        }
      );
    }

    const currentSockets =
      this.ctx.getWebSockets();

    const otherRoleSockets = [];

    /*
     * 同じ役割の古い接続が残っている場合は，
     * 新しい接続で置き換える。
     *
     * 例：
     * 古いsenderがWi-Fi瞬断で残っている
     * ↓
     * 新しいsenderが同じ部屋へ接続
     * ↓
     * 古いsenderを閉じて新しいsenderを採用
     */
    for (const existingSocket of currentSockets) {
      const state =
        this.getSocketState(existingSocket);

      const existingRole = state.role;

      /*
       * 旧版から残った役割不明の接続は，
       * 新しい接続を妨げないように閉じる。
       */
      if (
        existingRole !== "sender" &&
        existingRole !== "viewer"
      ) {
        this.setSocketState(
          existingSocket,
          {
            ...state,
            suppressPeerLeft: true
          }
        );

        this.closeSocketSafely(
          existingSocket,
          4000,
          "Stale connection replaced"
        );

        continue;
      }

      /*
       * 同じ役割なら古い接続を置き換える。
       */
      if (existingRole === requestedRole) {
        this.setSocketState(
          existingSocket,
          {
            ...state,
            suppressPeerLeft: true
          }
        );

        this.closeSocketSafely(
          existingSocket,
          4001,
          "Same role reconnected"
        );

        continue;
      }

      /*
       * 反対側の役割の接続は残す。
       */
      if (
        existingSocket.readyState ===
        WebSocket.OPEN
      ) {
        otherRoleSockets.push(existingSocket);
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Cloudflare側で接続を保持
    this.ctx.acceptWebSocket(
      server,
      [requestedRole]
    );

    /*
     * 接続の役割をWebSocket自身へ保存する。
     * Durable Objectが休止しても復元できる。
     */
    this.setSocketState(
      server,
      {
        role: requestedRole,
        connectionId: crypto.randomUUID(),
        connectedAt: Date.now(),
        suppressPeerLeft: false
      }
    );

    // 今回何台目かを通知
    server.send(
      JSON.stringify({
        type: "joined",
        position: otherRoleSockets.length + 1,
        role: requestedRole
      })
    );

    /*
     * すでに入っている反対側の端末へ，
     * 相手が入り直したことを通知する。
     *
     * HTML側はこの通知を受けると，
     * 古いRTCPeerConnectionを作り直す。
     */
    for (const socket of otherRoleSockets) {
      try {
        socket.send(
          JSON.stringify({
            type: "peer-joined",
            role: requestedRole,
            reconnected: true
          })
        );
      } catch {
        // 切断済みなら無視
      }
    }

    return new Response(
      null,
      {
        status: 101,
        webSocket: client
      }
    );
  }

  async webSocketMessage(sender, message) {
    /*
     * 受け取った接続情報を，
     * 相手側だけへ送る。
     */
    for (
      const socket
      of this.ctx.getWebSockets()
    ) {
      if (socket === sender) {
        continue;
      }

      if (
        socket.readyState !== WebSocket.OPEN
      ) {
        continue;
      }

      try {
        socket.send(message);
      } catch {
        // 切断済みなら無視
      }
    }
  }

  async webSocketClose(
    socket,
    code,
    reason
  ) {
    const state =
      this.getSocketState(socket);

    this.closeSocketSafely(
      socket,
      code,
      reason
    );

    /*
     * 同じ役割の再接続によって古い接続を
     * 置き換えた場合は，peer-leftを送らない。
     *
     * 送ってしまうと，残っている相手側まで
     * stopAll()されてしまうため。
     */
    if (state.suppressPeerLeft === true) {
      return;
    }

    // 本当の切断なら，残った相手へ通知
    for (
      const remaining
      of this.ctx.getWebSockets()
    ) {
      if (
        remaining.readyState !==
        WebSocket.OPEN
      ) {
        continue;
      }

      try {
        remaining.send(
          JSON.stringify({
            type: "peer-left",
            role: state.role || null
          })
        );
      } catch {
        // 切断済みなら無視
      }
    }
  }

  async webSocketError(socket) {
    const state =
      this.getSocketState(socket);

    /*
     * エラー切断は本当の通信切断なので，
     * suppressPeerLeftは付けない。
     */
    this.setSocketState(
      socket,
      {
        ...state,
        suppressPeerLeft: false
      }
    );

    this.closeSocketSafely(
      socket,
      1011,
      "WebSocket error"
    );
  }
}
