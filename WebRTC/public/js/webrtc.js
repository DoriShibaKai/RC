"use strict";

function closePeerConnectionSafely() {
  if (!peerConnection) {
    return;
  }

  peerConnection.onicecandidate = null;
  peerConnection.ondatachannel = null;
  peerConnection.ontrack = null;
  peerConnection.onconnectionstatechange = null;

  try {
    peerConnection.close();
  } catch (error) {
    console.warn("WebRTC接続を閉じられませんでした。", error);
  }

  peerConnection = null;
}


function getRoomName() {
      const roomName = roomInput.value.trim();

      if (!roomName) {
        throw new Error("部屋名を入力してください。");
      }

      return roomName;
    }


function createPeerConnection() {

      console.log("createPeerConnection開始");
      peerConnection = new RTCPeerConnection(rtcConfiguration);

      if (role === "sender") {
        const senderDriveChannel =
          peerConnection.createDataChannel("drive");

        configureDriveChannel(
          senderDriveChannel,
          "iPhone側",
          () => {
            driveStatusElement.textContent =
              "操縦接続が完了しました。\n" +
              "STOPを使用できます。";
          }
        );
      }

      peerConnection.onicecandidate = event => {
        if (!event.candidate) {
          return;
        }

        sendSignal({
          type: "ice-candidate",
          candidate: event.candidate
        });
      };

  peerConnection.ondatachannel = event => {
    configureDriveChannel(
      event.channel,
      "PC側",
      () => {
        sendStopCommand();

        driveStatusElement.textContent =
          "操縦接続が完了しました。\n" +
          "停止位置から開始します。";
      }
    );
  };

peerConnection.ontrack = event => {
  if (role !== "viewer") {
    return;
  }

  const [remoteStream] = event.streams;

  if (remoteStream) {
    videoElement.srcObject = remoteStream;
  } else {
    const stream = new MediaStream();
    stream.addTrack(event.track);
    videoElement.srcObject = stream;
  }

 videoElement.muted = false;
videoElement.classList.remove("hidden");

/*
  映像が表示されたあとのvideoWrapperサイズで，
  STOPボタンを再配置する
*/
scheduleStopButtonGeometryApply();

videoElement.play()
  .then(() => {
    scheduleStopButtonGeometryApply();
  })
  .catch(() => {
    scheduleStopButtonGeometryApply();

    setStatus(
      "映像を受信しました。\n" +
      "再生されない場合は、黒い映像部分を一度押してください。"
    );
  });
};

      peerConnection.onconnectionstatechange = () => {

        console.log("Ver 6");

        const state = peerConnection.connectionState;

        if (state === "connected") {

          console.log("★★★ connected ★★★");

if (driveChannel) {
    console.log("状態", driveChannel.readyState);
}

          setStatus(
            role === "sender"
              ? "接続成功：iPhoneの映像を送信しています。"
              : "接続成功：iPhoneの映像を受信しています。"
          );
        } else if (state === "disconnected") {
          activateCommunicationLossStop(
            "WebRTC通信が一時的に切断されました。"
          );
          setStatus("通信が一時的に切断され，自動STOPしました。");
        } else if (state === "failed") {
          activateCommunicationLossStop(
            "WebRTC接続に失敗しました。"
          );
          setStatus(
            "WebRTC接続に失敗しました。\n" +
            "いったん接続を終了し、両方でやり直してください。"
          );
        } else if (state === "closed") {
          setStatus("接続を終了しました。");
        }
      };

      return peerConnection;
    }


function sendSignal(data) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify(data)
  );
}


function rebuildPeerConnectionForReconnect() {

  /*
    古い操縦用DataChannelを停止する。
  */
  stopDriveCommandRepeater();
  stopDriveCommunicationWatchdog();

  currentDriveX = 0;
  currentDriveY = 0;

  closeDriveChannelSafely();

  /*
    古いRTCPeerConnectionを閉じる。
  */
  closePeerConnectionSafely();

  offerStarted = false;

  /*
    受信側では，古い相手映像を消して
    新しい映像を待つ。
  */
  if (role === "viewer") {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.classList.add("hidden");
    videoElement.muted = true;
  }

  /*
    現在の役割に合わせて，
    RTCPeerConnectionを新しく作る。
  */
  createPeerConnection();

  if (role === "sender") {

    /*
      送信側は，すでに取得済みの
      カメラ・マイクを新しい接続へ追加する。
    */
    if (localStream) {
      for (
        const track
        of localStream.getTracks()
      ) {
        peerConnection.addTrack(
          track,
          localStream
        );
      }
    }
  } else if (role === "viewer") {

    /*
      受信側は映像と音声を受信専用で準備する。
    */
    peerConnection.addTransceiver(
      "video",
      {
        direction: "recvonly"
      }
    );

    peerConnection.addTransceiver(
      "audio",
      {
        direction: "recvonly"
      }
    );
  }

  headerBadgeDot.classList.remove(
    "connected"
  );

  headerBadgeDot.classList.add(
    "connecting"
  );
}


function connectWebSocket(roomName) {
  return new Promise(
    (resolve, reject) => {

      const protocol =
        location.protocol === "https:"
          ? "wss:"
          : "ws:";

      /*
        sender／viewerをURLへ付ける。

        Cloudflare側はこの値を使って，
        同じ役割の古い接続を
        新しい接続へ置き換える。
      */
      const socketUrl =
        protocol +
        "//" +
        location.host +
        "/ws/" +
        encodeURIComponent(roomName) +
        "?role=" +
        encodeURIComponent(role);

      /*
        この接続専用の変数を作る。

        古いWebSocketのoncloseが，
        後から新しい接続を停止することを防ぐ。
      */
      const connectionSocket =
        new WebSocket(socketUrl);

      socket = connectionSocket;

      let connectionOpened = false;

      connectionSocket.onopen = () => {
        connectionOpened = true;

        sendSignal({
          type: "role",
          role
        });

        if (role === "sender") {
          sendSignal({
            type: "sender-ready"
          });

          setStatus(
            "カメラを準備しました。\n" +
            "パソコン側の接続を待っています。"
          );
        } else {
          sendSignal({
            type: "viewer-ready"
          });

          setStatus(
            "受信準備ができました。\n" +
            "iPhone側の接続を待っています。"
          );
        }

        resolve();
      };

      connectionSocket.onmessage =
        async event => {
          try {
            const message =
              JSON.parse(event.data);

            await handleSignal(message);
          } catch (error) {
            console.error(error);

            setStatus(
              "接続情報の処理中に" +
              "エラーが発生しました。"
            );
          }
        };

      connectionSocket.onerror = () => {
        /*
          接続開始前のエラーだけ，
          startSender／startViewerのcatchへ渡す。
        */
        if (!connectionOpened) {
          reject(
            new Error(
              "Cloudflareへの接続に失敗しました。"
            )
          );
        }
      };

      connectionSocket.onclose = () => {

        /*
          すでに別の新しいWebSocketへ
          入れ替わっている場合は何もしない。
        */
        if (socket !== connectionSocket) {
          return;
        }

        socket = null;

        /*
          通信途絶時は古いWebRTC・映像・操作状態を
          完全に片付ける。

          これにより，ネット回復後に同じ部屋名で
          送信／受信ボタンを再び押せる。
        */
        if (role !== null) {
          activateCommunicationLossStop(
            "WebSocket通信が切断されました。"
          );

          stopAll(false, {
            preserveEmergencyStop: true
          });

          setStatus(
            "通信が切断されました。\n" +
            "安全のためSTOP状態を保持しています。\n" +
            "ネット接続を確認して，同じ部屋名で接続し直してください。"
          );
        }
      };
    }
  );
}


async function handleSignal(message) {
      if (message.type === "joined") {
        return;
      }

    if (message.type === "peer-joined") {

  /*
    相手が同じ部屋へ入り直した場合，
    古いWebRTC接続を捨てて新しく準備する。
  */
  rebuildPeerConnectionForReconnect();

  if (role === "sender") {
    sendSignal({
      type: "sender-ready"
    });
  } else if (role === "viewer") {
    sendSignal({
      type: "viewer-ready"
    });
  }

  setStatus(
    "相手側が再接続しました。\n" +
    "WebRTC接続を作り直しています。"
  );

  return;
}

      if (
        message.type === "sender-ready" &&
        role === "viewer"
      ) {
        sendSignal({ type: "viewer-ready" });
        return;
      }

      if (
        message.type === "viewer-ready" &&
        role === "sender"
      ) {
        await createAndSendOffer();
        return;
      }

      if (
        message.type === "offer" &&
        role === "viewer"
      ) {
        await receiveOffer(message);
        return;
      }

      if (
        message.type === "answer" &&
        role === "sender"
      ) {
        await peerConnection.setRemoteDescription(
          message.answer
        );

        return;
      }

      if (message.type === "ice-candidate") {
        if (!peerConnection) {
          return;
        }

        try {
          await peerConnection.addIceCandidate(
            message.candidate
          );
        } catch (error) {
          console.error("ICE Candidate error:", error);
        }

        return;
      }

      if (message.type === "peer-left") {

  /*
    peer-leftは明示的な「接続を終了」と断定できないため，
    通信断として非常停止状態を保持する。
  */
  activateCommunicationLossStop(
    "相手側との通信が切断されました。"
  );

  stopAll(false, {
    preserveEmergencyStop: true
  });

  setStatus(
    "相手側との通信が切断されました。\n" +
    "安全のためSTOP状態を保持しています。"
  );

  return;
}
    }


async function createAndSendOffer() {
      if (
        role !== "sender" ||
        !peerConnection ||
        offerStarted
      ) {
        return;
      }

      offerStarted = true;

      try {
        const offer =
          await peerConnection.createOffer();

        await peerConnection.setLocalDescription(offer);

        sendSignal({
          type: "offer",
          offer: peerConnection.localDescription
        });

        setStatus("パソコンとWebRTC接続を開始しています。");
      } catch (error) {
        offerStarted = false;
        throw error;
      }
    }


async function receiveOffer(message) {
      if (!peerConnection) {
        createPeerConnection();

        peerConnection.addTransceiver("video", {
          direction: "recvonly"
        });

        peerConnection.addTransceiver("audio", {
          direction: "recvonly"
        });
      }

      await peerConnection.setRemoteDescription(
        message.offer
      );

      const answer =
        await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(answer);

      sendSignal({
        type: "answer",
        answer: peerConnection.localDescription
      });

      setStatus("iPhoneからの映像を接続しています。");
    }


async function startSender() {
      try {
        role = "sender";

sendButton.classList.add("selectedRole");
viewButton.classList.remove("selectedRole");

offerStarted = false;
setControlsConnected();

        setStatus(
          "iPhoneのカメラ使用許可を確認しています。"
        );

        localStream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: {
                ideal: "environment"
              },
              width: {
                ideal: 1280
              },
              height: {
                ideal: 720
              }
            },
            audio: true
          });

        videoElement.srcObject = localStream;
videoElement.muted = true;
videoElement.classList.remove("hidden");

/*
  hidden解除直後と再生開始後の両方で，
  STOPボタンを再配置する
*/
scheduleStopButtonGeometryApply();

await videoElement.play();

scheduleStopButtonGeometryApply();

createPeerConnection();

        for (const track of localStream.getTracks()) {
          peerConnection.addTrack(track, localStream);
        }

        await connectWebSocket(getRoomName());
      } catch (error) {
        console.error(error);
        setStatus(
          "カメラを開始できませんでした。\n" +
          error.message
        );
        stopAll(false);
      }
    }


async function startViewer() {
      try {
        role = "viewer";

viewButton.classList.add("selectedRole");
sendButton.classList.remove("selectedRole");

offerStarted = false;
setControlsConnected();

        createPeerConnection();

        peerConnection.addTransceiver("video", {
          direction: "recvonly"
        });

        peerConnection.addTransceiver("audio", {
          direction: "recvonly"
        });

        await connectWebSocket(getRoomName());
      } catch (error) {
        console.error(error);
        setStatus(
          "受信を開始できませんでした。\n" +
          error.message
        );
        stopAll(false);
      }
    }


function disconnectBoth() {

  // 二重送信を防ぐ
  if (disconnectRequestPending) {
    return;
  }

  // WebRTCのDataChannelが開いていれば，
  // 相手へ切断要求を送り，確認応答を待つ
  if (isDriveChannelOpen()) {
    disconnectRequestPending = true;

    driveChannel.send(
      JSON.stringify({
        type: "disconnect-all"
      })
    );

    setStatus(
      "相手側へ切断を通知しています。"
    );

    // 確認応答が来ない場合でも，1.5秒後には終了する
    disconnectAckTimer = setTimeout(() => {
      disconnectAckTimer = null;
      disconnectRequestPending = false;
      stopAll(true);
    }, 1500);

    return;
  }

  // DataChannelが使えない場合は自分側だけ終了
  stopAll(true);
}


function stopAll(
        showMessage = true,
        options = {}
      ) {
  const {
    preserveEmergencyStop = false
  } = options;
  stopDriveCommandRepeater();
  currentDriveX = 0;
  currentDriveY = 0;

  stopDriveCommunicationWatchdog();

      if (disconnectAckTimer) {
        clearTimeout(disconnectAckTimer);
        disconnectAckTimer = null;
      }

      disconnectRequestPending = false;

      /*
        「すべて切断」なので，
        AtomS3 LiteとのBLE接続も終了する
      */
      disconnectBleDevice();

      role = null;
      offerStarted = false;

      if (socket) {
        socket.onclose = null;
        socket.close();
        socket = null;
      }

      closeDriveChannelSafely();
      closePeerConnectionSafely();

      if (localStream) {
        for (const track of localStream.getTracks()) {
          track.stop();
        }

        localStream = null;
      }

      videoElement.pause();
      videoElement.srcObject = null;
      videoElement.classList.add("hidden");
      videoElement.muted = true;

     joystickActive = false;
joystickCandidate = false;
joystickPointerId = null;

if (preserveEmergencyStop) {
  applyDriveStopState(true);
} else {
  clearEmergencyStopState({
    notifyPeer: false,
    statusMessage: ""
  });
}
joystickArea.style.display = "none";
cancelMobileFullscreenHold();
hideMobileFullscreenButton();

      joystickKnob.style.left = "50%";
      joystickKnob.style.top = "50%";

      xyDisplay.textContent = "X：0.00　Y：0.00";

      setControlsDisconnected();

      if (showMessage) {
        setStatus("接続を終了しました。");
      }
    }
