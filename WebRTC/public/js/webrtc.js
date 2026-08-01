"use strict";


function closePeerConnectionSafely() {
  if (!peerConnection) {
    return;
  }

  const connection = peerConnection;

  connection.onicecandidate = null;
  connection.ondatachannel = null;
  connection.ontrack = null;
  connection.onconnectionstatechange = null;

  try {
    connection.close();
  } catch (error) {
    console.warn(
      "WebRTC接続を閉じられませんでした。",
      error
    );
  }

  if (peerConnection === connection) {
    peerConnection = null;
  }
}


function getRoomName() {
  const roomName =
    roomInput.value.trim();

  if (!roomName) {
    throw new Error(
      "部屋名を入力してください。"
    );
  }

  return roomName;
}


/*
  相手側が通信から離れたときの安全処理。

  stopAll()は使わない。
  stopAll()を使うと映像枠が隠れ，
  STOPボタンも見えなくなるため。

  ここでは，
  ・非常停止状態を保持
  ・WebRTCとDataChannelだけ片付ける
  ・受信側は黒い映像枠を残す
  ・「解除」ボタンを画面上に残す
  ・同じ相手の再接続を待つ
  という状態にする。
*/
function handlePeerCommunicationLoss(
  message =
    "相手側との通信が切断されました。"
) {
  activateCommunicationLossStop(message);

  stopDriveCommandRepeater();
  stopDriveCommunicationWatchdog();

  currentDriveX = 0;
  currentDriveY = 0;

  closeDriveChannelSafely();
  closePeerConnectionSafely();

  offerStarted = false;

  joystickActive = false;
  joystickCandidate = false;
  joystickPointerId = null;

  joystickArea.style.display =
    "none";

  joystickKnob.style.left =
    "50%";

  joystickKnob.style.top =
    "50%";

  xyDisplay.textContent =
    "X：0.00　Y：0.00";

  /*
    PCなどの受信側では，
    映像ストリームだけを外して黒画面にする。

    hiddenは付けないため，
    映像枠と「解除」ボタンは残る。
  */
  if (role === "viewer") {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.muted = true;
    videoElement.classList.remove(
      "hidden"
    );

    scheduleStopButtonGeometryApply();
  }

  headerBadgeDot.classList.remove(
    "connected"
  );

  headerBadgeDot.classList.add(
    "connecting"
  );

  /*
    DataChannelが閉じている間は解除通知を
    相手へ送れないためボタンは無効になるが，
    「解除」の表示自体は残す。
  */
  updateDriveStopButtonAvailability();

  setStatus(
    "相手側との通信が切断されました。\n" +
    "安全のためSTOP状態を保持しています。\n" +
    "相手側の再接続を待っています。"
  );

  driveStatusElement.textContent =
    "通信が切断されました。非常停止状態を保持しています。";
}


function createPeerConnection() {
  console.log(
    "createPeerConnection開始"
  );

  const connection =
    new RTCPeerConnection(
      rtcConfiguration
    );

  peerConnection = connection;

  if (role === "sender") {
    const senderDriveChannel =
      connection.createDataChannel(
        "drive"
      );

    configureDriveChannel(
      senderDriveChannel,
      "iPhone側",
      () => {
        driveStatusElement.textContent =
          driveStopped
            ? "操縦接続が復旧しました。非常停止状態を保持しています。"
            : "操縦接続が完了しました。\nSTOPを使用できます。";
      }
    );
  }

  connection.onicecandidate =
    event => {
      if (!event.candidate) {
        return;
      }

      sendSignal({
        type: "ice-candidate",
        candidate: event.candidate
      });
    };

  connection.ondatachannel =
    event => {
      configureDriveChannel(
        event.channel,
        "PC側",
        () => {
          /*
            接続直後は必ず停止座標を送る。

            非常停止中なら，
            「解除」表示を保持したまま
            相手側へ非常停止状態を再通知する。
          */
          sendStopCommand();

          if (driveStopped) {
            applyEmergencyStopState({
              notifyPeer: true,
              statusMessage: ""
            });
          }

          driveStatusElement.textContent =
            driveStopped
              ? "操縦接続が復旧しました。非常停止状態を保持しています。"
              : "操縦接続が完了しました。\n停止位置から開始します。";
        }
      );
    };

  connection.ontrack =
    event => {
      if (role !== "viewer") {
        return;
      }

      const [remoteStream] =
        event.streams;

      if (remoteStream) {
        videoElement.srcObject =
          remoteStream;
      } else {
        const stream =
          new MediaStream();

        stream.addTrack(
          event.track
        );

        videoElement.srcObject =
          stream;
      }

      videoElement.muted = false;

      videoElement.classList.remove(
        "hidden"
      );

      scheduleStopButtonGeometryApply();

      videoElement.play()
        .then(() => {
          scheduleStopButtonGeometryApply();
        })
        .catch(() => {
          scheduleStopButtonGeometryApply();

          setStatus(
            "映像を受信しました。\n" +
            "再生されない場合は，黒い映像部分を一度押してください。"
          );
        });
    };

  connection.onconnectionstatechange =
    () => {
      /*
        古いRTCPeerConnectionの
        遅れて届いたイベントは無視する。
      */
      if (
        peerConnection !== connection
      ) {
        return;
      }

      const state =
        connection.connectionState;

      console.log(
        "WebRTC connectionState:",
        state
      );

      if (state === "connected") {
        setStatus(
          role === "sender"
            ? "接続成功：iPhoneの映像を送信しています。"
            : "接続成功：iPhoneの映像を受信しています。"
        );

        /*
          接続が復旧しても，
          非常停止状態は自動解除しない。
        */
        if (driveStopped) {
          applyDriveStopState(true);
        }

        return;
      }

      if (state === "disconnected") {
        activateCommunicationLossStop(
          "WebRTC通信が一時的に切断されました。"
        );

        setStatus(
          "通信が一時的に切断され，安全のため自動STOPしました。"
        );

        return;
      }

      if (state === "failed") {
        handlePeerCommunicationLoss(
          "WebRTC接続に失敗しました。"
        );

        return;
      }

      if (
        state === "closed" &&
        role !== null
      ) {
        setStatus(
          "WebRTC接続が終了しました。"
        );
      }
    };

  return connection;
}


function sendSignal(data) {
  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify(data)
  );
}


function rebuildPeerConnectionForReconnect() {
  stopDriveCommandRepeater();
  stopDriveCommunicationWatchdog();

  currentDriveX = 0;
  currentDriveY = 0;

  closeDriveChannelSafely();
  closePeerConnectionSafely();

  offerStarted = false;

  /*
    受信側では，
    再接続中も黒い映像枠と
    「解除」ボタンを残す。
  */
  if (role === "viewer") {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.muted = true;

    videoElement.classList.remove(
      "hidden"
    );

    scheduleStopButtonGeometryApply();
  }

  createPeerConnection();

  if (role === "sender") {
    /*
      送信側は取得済みの
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

  /*
    再接続を始めても，
    非常停止表示はそのまま保持する。
  */
  if (driveStopped) {
    applyDriveStopState(true);
  }
}


function connectWebSocket(roomName) {
  return new Promise(
    (resolve, reject) => {
      const protocol =
        location.protocol === "https:"
          ? "wss:"
          : "ws:";

      const socketUrl =
        protocol +
        "//" +
        location.host +
        "/ws/" +
        encodeURIComponent(
          roomName
        ) +
        "?role=" +
        encodeURIComponent(role);

      /*
        このWebSocket専用の参照を保持し，
        古いoncloseが新しい接続へ
        影響しないようにする。
      */
      const connectionSocket =
        new WebSocket(socketUrl);

      socket = connectionSocket;

      let connectionOpened = false;

      connectionSocket.onopen =
        () => {
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

            await handleSignal(
              message
            );
          } catch (error) {
            console.error(error);

            setStatus(
              "接続情報の処理中に" +
              "エラーが発生しました。"
            );
          }
        };

      connectionSocket.onerror =
        () => {
          /*
            接続開始前のエラーだけ，
            startSender／startViewerの
            catchへ渡す。
          */
          if (!connectionOpened) {
            reject(
              new Error(
                "Cloudflareへの接続に失敗しました。"
              )
            );
          }
        };

      connectionSocket.onclose =
        () => {
          /*
            すでに新しいWebSocketへ
            入れ替わっている場合は無視する。
          */
          if (
            socket !==
            connectionSocket
          ) {
            return;
          }

          socket = null;

          /*
            この端末自身のWebSocketが切れた場合は，
            同じページ内で自動再接続できないため
            接続操作画面へ戻す。

            非常停止状態だけは保持する。
          */
          if (role !== null) {
            activateCommunicationLossStop(
              "WebSocket通信が切断されました。"
            );

            stopAll(
              false,
              {
                preserveEmergencyStop: true
              }
            );

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

  if (
    message.type === "peer-joined"
  ) {
    /*
      相手が同じ部屋へ入り直した場合，
      古いWebRTC接続を捨てて
      新しい接続を準備する。
    */
    rebuildPeerConnectionForReconnect();

    if (role === "sender") {
      sendSignal({
        type: "sender-ready"
      });
    } else if (
      role === "viewer"
    ) {
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
    message.type ===
      "sender-ready" &&
    role === "viewer"
  ) {
    sendSignal({
      type: "viewer-ready"
    });

    return;
  }

  if (
    message.type ===
      "viewer-ready" &&
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
    if (!peerConnection) {
      return;
    }

    await peerConnection
      .setRemoteDescription(
        message.answer
      );

    return;
  }

  if (
    message.type ===
      "ice-candidate"
  ) {
    if (!peerConnection) {
      return;
    }

    try {
      await peerConnection
        .addIceCandidate(
          message.candidate
        );
    } catch (error) {
      console.error(
        "ICE Candidate error:",
        error
      );
    }

    return;
  }

  if (
    message.type === "peer-left"
  ) {
    /*
      相手側だけが離れた場合は，
      ページ全体を初期状態へ戻さない。

      黒い映像枠と「解除」ボタンを残し，
      同じ相手の再接続を待つ。
    */
    handlePeerCommunicationLoss(
      "相手側との通信が切断されました。"
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
      await peerConnection
        .createOffer();

    await peerConnection
      .setLocalDescription(offer);

    sendSignal({
      type: "offer",
      offer:
        peerConnection
          .localDescription
    });

    setStatus(
      "パソコンとWebRTC接続を開始しています。"
    );
  } catch (error) {
    offerStarted = false;
    throw error;
  }
}


async function receiveOffer(message) {
  if (!peerConnection) {
    createPeerConnection();

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

  await peerConnection
    .setRemoteDescription(
      message.offer
    );

  const answer =
    await peerConnection
      .createAnswer();

  await peerConnection
    .setLocalDescription(answer);

  sendSignal({
    type: "answer",
    answer:
      peerConnection
        .localDescription
  });

  setStatus(
    "iPhoneからの映像を接続しています。"
  );
}


async function startSender() {
  try {
    role = "sender";

    sendButton.classList.add(
      "selectedRole"
    );

    viewButton.classList.remove(
      "selectedRole"
    );

    offerStarted = false;
    setControlsConnected();

    setStatus(
      "iPhoneのカメラ使用許可を確認しています。"
    );

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
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

    videoElement.srcObject =
      localStream;

    videoElement.muted = true;

    videoElement.classList.remove(
      "hidden"
    );

    scheduleStopButtonGeometryApply();

    await videoElement.play();

    scheduleStopButtonGeometryApply();

    createPeerConnection();

    for (
      const track
      of localStream.getTracks()
    ) {
      peerConnection.addTrack(
        track,
        localStream
      );
    }

    await connectWebSocket(
      getRoomName()
    );
  } catch (error) {
    console.error(error);

    setStatus(
      "カメラを開始できませんでした。\n" +
      error.message
    );

    stopAll(
      false,
      {
        preserveEmergencyStop:
          driveStopped
      }
    );
  }
}


async function startViewer() {
  try {
    role = "viewer";

    viewButton.classList.add(
      "selectedRole"
    );

    sendButton.classList.remove(
      "selectedRole"
    );

    offerStarted = false;
    setControlsConnected();

    createPeerConnection();

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

    await connectWebSocket(
      getRoomName()
    );
  } catch (error) {
    console.error(error);

    setStatus(
      "受信を開始できませんでした。\n" +
      error.message
    );

    stopAll(
      false,
      {
        preserveEmergencyStop:
          driveStopped
      }
    );
  }
}


function disconnectBoth() {
  /*
    利用者が明示的に
    「すべて切断」を押した場合。

    この場合だけ，
    非常停止状態を通常の初期状態へ戻す。
  */
  if (disconnectRequestPending) {
    return;
  }

  if (isDriveChannelOpen()) {
    disconnectRequestPending = true;

    sendDriveChannelPayload({
      type: "disconnect-all"
    });

    setStatus(
      "相手側へ切断を通知しています。"
    );

    disconnectAckTimer =
      setTimeout(
        () => {
          disconnectAckTimer = null;

          disconnectRequestPending =
            false;

          stopAll(true);
        },
        1500
      );

    return;
  }

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
  stopDriveCommunicationWatchdog();

  currentDriveX = 0;
  currentDriveY = 0;

  if (disconnectAckTimer) {
    clearTimeout(
      disconnectAckTimer
    );

    disconnectAckTimer = null;
  }

  disconnectRequestPending = false;

  /*
    明示的な「すべて切断」のときだけ
    BLEも切断する。

    通信断では，
    停止命令を送れるようBLEを維持する。
  */
  if (!preserveEmergencyStop) {
    disconnectBleDevice();
  }

  role = null;
  offerStarted = false;

  if (socket) {
    const closingSocket = socket;

    socket = null;

    closingSocket.onopen = null;
    closingSocket.onmessage = null;
    closingSocket.onerror = null;
    closingSocket.onclose = null;

    try {
      closingSocket.close();
    } catch (error) {
      console.warn(
        "WebSocketを閉じられませんでした。",
        error
      );
    }
  }

  closeDriveChannelSafely();
  closePeerConnectionSafely();

  if (localStream) {
    for (
      const track
      of localStream.getTracks()
    ) {
      track.stop();
    }

    localStream = null;
  }

  videoElement.pause();
  videoElement.srcObject = null;

  videoElement.classList.add(
    "hidden"
  );

  videoElement.muted = true;

  joystickActive = false;
  joystickCandidate = false;
  joystickPointerId = null;

  joystickArea.style.display =
    "none";

  cancelMobileFullscreenHold();
  hideMobileFullscreenButton();

  joystickKnob.style.left =
    "50%";

  joystickKnob.style.top =
    "50%";

  xyDisplay.textContent =
    "X：0.00　Y：0.00";

  if (preserveEmergencyStop) {
    applyEmergencyStopState({
      notifyPeer: false,
      statusMessage: ""
    });
  } else {
    clearEmergencyStopState({
      notifyPeer: false,
      statusMessage: ""
    });
  }

  setControlsDisconnected();

  if (showMessage) {
    setStatus(
      "接続を終了しました。"
    );
  }
}
