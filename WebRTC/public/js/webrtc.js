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
  この端末のマイク送信状態。

  初期状態はOFF。
  loadSettings()で保存値を読み込む。
*/
let microphoneEnabled = false;


/*
  この端末が取得したマイク専用ストリーム。

  sender／viewerのどちらでも，
  マイクはlocalStreamへ入れず，
  このストリームで管理する。
*/
let localMicrophoneStream = null;


/*
  受信側から音声を送るための
  RTCRtpTransceiver。
*/
let localAudioTransceiver = null;


/*
  相手から届いた音声を再生する
  audio要素を取得する。

  まだ存在しない場合は自動で作る。
*/
function getRemoteAudioElement() {
  let audioElement =
    document.getElementById(
      "remoteAudioElement"
    );

  if (audioElement) {
    return audioElement;
  }

  audioElement =
    document.createElement("audio");

  audioElement.id =
    "remoteAudioElement";

  audioElement.autoplay = true;
  audioElement.playsInline = true;

  /*
    相手音声を再生するため，
    mutedにはしない。
  */
  audioElement.muted = false;

  /*
    画面上には表示しない。
  */
  audioElement.style.display = "none";

  document.body.appendChild(
    audioElement
  );

  return audioElement;
}


/*
  現在この端末が持っている
  マイクトラックを返す。
*/
function getExistingMicrophoneTrack() {
  if (localStream) {
    const track =
      localStream
        .getAudioTracks()[0];

    if (track) {
      return track;
    }
  }

  if (localMicrophoneStream) {
    const track =
      localMicrophoneStream
        .getAudioTracks()[0];

    if (track) {
      return track;
    }
  }

  return null;
}


/*
  必要な場合だけ端末のマイクを取得する。
*/
async function ensureMicrophoneTrack() {
  const existingTrack =
    getExistingMicrophoneTrack();

  if (
    existingTrack &&
    existingTrack.readyState === "live"
  ) {
    return existingTrack;
  }

  localMicrophoneStream =
    await navigator.mediaDevices
      .getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

  return localMicrophoneStream
    .getAudioTracks()[0];
}


/*
  受信側の音声送信用transceiverを探す。
*/
function findLocalAudioTransceiver() {
  if (localAudioTransceiver) {
    return localAudioTransceiver;
  }

  if (!peerConnection) {
    return null;
  }

  localAudioTransceiver =
    peerConnection
      .getTransceivers()
      .find(
        transceiver =>
          transceiver.receiver &&
          transceiver.receiver.track &&
          transceiver.receiver.track.kind ===
            "audio"
      ) || null;

  return localAudioTransceiver;
}


/*
  マイクのON／OFFを切り替える。

  OFFでも接続自体は切らず，
  音声トラックだけを無効化する。
*/
async function setMicrophoneEnabled(
  enabled
) {
  microphoneEnabled =
    Boolean(enabled);

  /*
    接続前は設定表示だけ変更する。

    実際のマイク取得と送信は，
    接続開始後に行う。
  */
  if (
    !peerConnection ||
    role === null
  ) {
    updateMicrophoneSettingsDisplay();
    return;
  }

   const transceiver =
    findLocalAudioTransceiver();

  /*
    viewer側でOffer到着前に切り替えた場合は，
    設定だけ保持する。

    receiveOffer()で音声Transceiverが
    準備された時点で反映する。
  */
  if (
    !transceiver ||
    !transceiver.sender
  ) {
    updateMicrophoneSettingsDisplay();

    setStatus(
      microphoneEnabled
        ? "マイク送信をONにしました。\n接続完了後に送信を開始します。"
        : "マイク送信をOFFにしました。"
    );

    return;
  }

  if (microphoneEnabled) {
    const microphoneTrack =
      await ensureMicrophoneTrack();

    microphoneTrack.enabled = true;

    await transceiver.sender
      .replaceTrack(
        microphoneTrack
      );

    updateMicrophoneSettingsDisplay();

    setStatus(
      "マイク送信をONにしました。"
    );

    return;
  }

  /*
    マイクOFF。

    接続は維持したまま，
    音声トラックだけを外す。
  */
  await transceiver.sender
    .replaceTrack(null);

  if (localMicrophoneStream) {
    for (
      const track
      of localMicrophoneStream.getTracks()
    ) {
      track.stop();
    }

    localMicrophoneStream = null;
  }

  updateMicrophoneSettingsDisplay();

  setStatus(
    "マイク送信をOFFにしました。"
  );
}

/*
  現在この端末が持っている
  カメラトラックを返す。
*/
function getExistingCameraTrack() {

  if (!localStream) {
    return null;
  }

  return (
    localStream
      .getVideoTracks()[0] ||
    null
  );
}


/*
  必要な場合だけ端末のカメラを取得する。
*/
async function ensureCameraTrack() {

  const existingTrack =
    getExistingCameraTrack();

  if (
    existingTrack &&
    existingTrack.readyState === "live"
  ) {
    return existingTrack;
  }

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

        audio: false
      });

  return (
    localStream
      .getVideoTracks()[0]
  );
}


/*
  この端末の映像送受信用
  Transceiverを探す。
*/
function findLocalVideoTransceiver() {

  if (localVideoTransceiver) {
    return localVideoTransceiver;
  }

  if (!peerConnection) {
    return null;
  }

  localVideoTransceiver =
    peerConnection
      .getTransceivers()
      .find(
        transceiver =>
          transceiver.receiver &&
          transceiver.receiver.track &&
          transceiver.receiver.track.kind ===
            "video"
      ) || null;

  return localVideoTransceiver;
}


/*
  この端末のカメラ状態を
  相手へ通知する。
*/
function sendCameraState() {

  sendSignal({
    type: "camera-state",
    enabled:
      Boolean(localCameraEnabled)
  });
}


/*
  自分のカメラ送信を切り替える。

  WebRTC接続は維持したまま，
  映像トラックだけを
  replaceTrack()で交換する。
*/
async function setCameraEnabled(enabled) {

  localCameraEnabled =
    Boolean(enabled);

  /*
    接続前は設定だけ保持する。
  */
  if (
    !peerConnection ||
    role === null
  ) {
    updateVideoLayout();
    return;
  }

  const transceiver =
    findLocalVideoTransceiver();

  /*
    viewer側でOffer到着前など，
    映像Transceiverがまだない場合。
  */
  if (
    !transceiver ||
    !transceiver.sender
  ) {
    updateVideoLayout();
    sendCameraState();
    return;
  }

  if (localCameraEnabled) {

    const cameraTrack =
      await ensureCameraTrack();

    cameraTrack.enabled = true;

    await transceiver.sender
      .replaceTrack(
        cameraTrack
      );

    updateVideoLayout();
    sendCameraState();

    setStatus(
      "カメラ送信をONにしました。"
    );

    return;
  }

  /*
    カメラOFF。

    接続は維持したまま，
    映像トラックだけを外す。
  */
  await transceiver.sender
    .replaceTrack(null);

  if (localStream) {
    for (
      const track
      of localStream.getTracks()
    ) {
      track.stop();
    }

    localStream = null;
  }

  updateVideoLayout();
  sendCameraState();

  setStatus(
    "カメラ送信をOFFにしました。"
  );
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
    相手との通信が切れた場合は，
    黒い映像枠も含めて非表示にする。
  */
  videoConnectionActive = false;
  remoteCameraEnabled = false;
  remoteVideoStream = null;

  updateVideoLayout();

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
    /*
      相手から届いた音声。

      sender／viewerの役割に関係なく，
      専用のaudio要素で再生する。
    */
    if (event.track.kind === "audio") {
      const remoteAudioElement =
        getRemoteAudioElement();

      /*
        映像を含まない，
        相手音声だけのストリームを作る。
      */
      const remoteAudioStream =
        new MediaStream([
          event.track
        ]);

      remoteAudioElement.srcObject =
        remoteAudioStream;

      remoteAudioElement.muted = false;
      remoteAudioElement.defaultMuted =
        false;

      remoteAudioElement.removeAttribute(
        "muted"
      );

      remoteAudioElement.volume = 1;

      const playRemoteAudio =
        () => {
          remoteAudioElement.play()
            .then(() => {
              document.removeEventListener(
                "pointerdown",
                playRemoteAudio
              );

              document.removeEventListener(
                "click",
                playRemoteAudio
              );
            })
            .catch(error => {
              console.warn(
                "相手音声を再生できませんでした。",
                error
              );
            });
        };

      remoteAudioElement.play()
        .catch(error => {
          console.warn(
            "相手音声の自動再生が停止されました。",
            error
          );

          /*
            特にiPhoneでは，
            音声付きメディアの自動再生が
            停止される場合がある。

            次に画面を押したとき再生する。
          */
          document.addEventListener(
            "pointerdown",
            playRemoteAudio,
            {
              once: true
            }
          );

          document.addEventListener(
            "click",
            playRemoteAudio,
            {
              once: true
            }
          );

          setStatus(
            "相手の音声を受信しました。\n" +
            "音声が出ない場合は，画面を一度押してください。"
          );
        });

      return;
    }


      /*
      相手から届いた映像。

      sender／viewerの役割に関係なく，
      相手映像専用ストリームとして保持する。
    */
    if (
      event.track.kind !== "video"
    ) {
      return;
    }

    remoteVideoStream =
      new MediaStream([
        event.track
      ]);

    /*
      replaceTrack(null)中は，
      映像トラック自体は存在しても
      実映像が届かない場合がある。

      実際のON／OFF状態は
      camera-state通知で管理する。
    */
    event.track.onunmute =
      () => {
        updateVideoLayout();
        scheduleStopButtonGeometryApply();
      };

    event.track.onmute =
      () => {
        updateVideoLayout();
      };

    event.track.onended =
      () => {
        remoteCameraEnabled = false;
        remoteVideoStream = null;

        updateVideoLayout();
      };

    updateVideoLayout();
    scheduleStopButtonGeometryApply();
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

        videoConnectionActive = true;

        updateVideoLayout();
        sendCameraState();

        scheduleStopButtonGeometryApply();

        setStatus(
          "接続成功：映像と音声を接続しました。"
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

  /*
    通信が切れた時点で，
    黒い映像枠を含めて映像表示を隠す。
  */
  videoConnectionActive = false;
  remoteCameraEnabled = false;
  remoteVideoStream = null;

  updateVideoLayout();

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


async function rebuildPeerConnectionForReconnect() {
  stopDriveCommandRepeater();
  stopDriveCommunicationWatchdog();

  currentDriveX = 0;
  currentDriveY = 0;

  closeDriveChannelSafely();
  closePeerConnectionSafely();

   localAudioTransceiver = null;
  localVideoTransceiver = null;

  remoteVideoStream = null;
  remoteCameraEnabled = false;
  videoConnectionActive = false;

  offerStarted = false;

  updateVideoLayout();

  createPeerConnection();

   /*
    Offerを作るsender側だけ，
    Offer作成前に映像と音声の枠を
    それぞれ1本ずつ準備する。
  */
  if (role === "sender") {

    localVideoTransceiver =
      peerConnection.addTransceiver(
        "video",
        {
          direction: "sendrecv"
        }
      );

    if (localCameraEnabled) {

      const cameraTrack =
        await ensureCameraTrack();

      cameraTrack.enabled = true;

      await localVideoTransceiver
        .sender
        .replaceTrack(
          cameraTrack
        );
    }

    localAudioTransceiver =
      peerConnection.addTransceiver(
        "audio",
        {
          direction: "sendrecv"
        }
      );

    if (microphoneEnabled) {

      const microphoneTrack =
        await ensureMicrophoneTrack();

      microphoneTrack.enabled = true;

      await localAudioTransceiver
        .sender
        .replaceTrack(
          microphoneTrack
        );
    }
  }

  /*
    viewer側はここでTransceiverを作らない。

    senderからOfferが届いた後，
    receiveOffer()でOffer内の
    Transceiverを取得する。
  */

  headerBadgeDot.classList.remove(
    "connected"
  );

  headerBadgeDot.classList.add(
    "connecting"
  );

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

  if (
    message.type ===
      "camera-state"
  ) {
    remoteCameraEnabled =
      Boolean(message.enabled);

    updateVideoLayout();
    scheduleStopButtonGeometryApply();

    return;
  }

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
   await rebuildPeerConnectionForReconnect();

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
  }

  /*
    先にsenderから届いたOfferを設定する。

    Offerに含まれるvideo／audioの
    Transceiverがここで作られる。
  */
  await peerConnection
    .setRemoteDescription(
      message.offer
    );

    localVideoTransceiver =
    peerConnection
      .getTransceivers()
      .find(
        transceiver =>
          transceiver.receiver &&
          transceiver.receiver.track &&
          transceiver.receiver.track.kind ===
            "video"
      ) || null;

  if (!localVideoTransceiver) {
    throw new Error(
      "映像用のWebRTC接続を準備できませんでした。"
    );
  }

  /*
    viewer側も映像を送受信できる状態で
    Answerを作る。
  */
  localVideoTransceiver.direction =
    "sendrecv";

  if (localCameraEnabled) {

  const cameraTrack =
    await ensureCameraTrack();

  cameraTrack.enabled = true;

  await localVideoTransceiver
    .sender
    .replaceTrack(
      cameraTrack
    );

} else {

  await localVideoTransceiver
    .sender
    .replaceTrack(null);
}

  localAudioTransceiver =
    peerConnection
      .getTransceivers()
      .find(
        transceiver =>
          transceiver.receiver &&
          transceiver.receiver.track &&
          transceiver.receiver.track.kind ===
            "audio"
      ) || null;

  if (!localAudioTransceiver) {
    throw new Error(
      "音声用のWebRTC接続を準備できませんでした。"
    );
  }

  /*
    viewer側も音声を送受信できる状態で
    Answerを作る。
  */
  localAudioTransceiver.direction =
    "sendrecv";

  if (microphoneEnabled) {
    const microphoneTrack =
      await ensureMicrophoneTrack();

    microphoneTrack.enabled = true;

    await localAudioTransceiver
      .sender
      .replaceTrack(
        microphoneTrack
      );
  } else {
    await localAudioTransceiver
      .sender
      .replaceTrack(null);
  }

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
    "相手の映像を接続しています。"
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

/*
  保存されたカメラ設定がある場合は，
  その設定を使用する。

  保存値がない初回だけ，
  カメラ送信側の標準値をONにする。
*/
const savedCameraEnabled =
  localStorage.getItem(
    "localCameraEnabled"
  );

localCameraEnabled =
  savedCameraEnabled === null
    ? true
    : savedCameraEnabled === "true";

remoteCameraEnabled = false;
videoConnectionActive = false;

updateVideoSettingsDisplay();

setStatus(
  localCameraEnabled
    ? "カメラの使用許可を確認しています。"
    : "カメラ送信OFFで接続を開始します。"
);

let cameraTrack = null;

if (localCameraEnabled) {

  cameraTrack =
    await ensureCameraTrack();

  cameraTrack.enabled = true;
}

updateMicrophoneSettingsDisplay();
updateVideoSettingsDisplay();
updateVideoLayout();

createPeerConnection();

    /*
      映像Transceiverは必ず1本だけ作る。
    */
    localVideoTransceiver =
      peerConnection.addTransceiver(
        "video",
        {
          direction: "sendrecv"
        }
      );

    await localVideoTransceiver
      .sender
      .replaceTrack(
        cameraTrack
      );

    /*
      音声Transceiverは必ず1本だけ作る。
    */
    localAudioTransceiver =
      peerConnection.addTransceiver(
        "audio",
        {
          direction: "sendrecv"
        }
      );

    if (microphoneEnabled) {
      setStatus(
        "マイクの使用許可を確認しています。"
      );

      const microphoneTrack =
        await ensureMicrophoneTrack();

      microphoneTrack.enabled = true;

      await localAudioTransceiver
        .sender
        .replaceTrack(
          microphoneTrack
        );
    }

    await connectWebSocket(
      getRoomName()
    );
  } catch (error) {
    console.error(error);

    setStatus(
  "接続を開始できませんでした。\n" +
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

   /*
  保存されたカメラ設定がある場合は，
  その設定を使用する。

  保存値がない初回だけ，
  カメラ受信側の標準値をOFFにする。
*/
const savedCameraEnabled =
  localStorage.getItem(
    "localCameraEnabled"
  );

localCameraEnabled =
  savedCameraEnabled === null
    ? false
    : savedCameraEnabled === "true";

remoteCameraEnabled = false;
videoConnectionActive = false;

updateVideoSettingsDisplay();
updateVideoLayout();

    viewButton.classList.add(
      "selectedRole"
    );

    sendButton.classList.remove(
      "selectedRole"
    );

    offerStarted = false;
    setControlsConnected();

    /*
      viewer側はPeerConnectionだけ作る。

      TransceiverはsenderのOfferを受信した後，
      receiveOffer()で取得する。
    */
    createPeerConnection();

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

localAudioTransceiver = null;
localVideoTransceiver = null;

remoteVideoStream = null;
remoteCameraEnabled = false;
videoConnectionActive = false;

if (localStream) {
  for (
    const track
    of localStream.getTracks()
  ) {
    track.stop();
  }

  localStream = null;
}

if (localMicrophoneStream) {
  for (
    const track
    of localMicrophoneStream.getTracks()
  ) {
    track.stop();
  }

  localMicrophoneStream = null;
}

const remoteAudioElement =
  document.getElementById(
    "remoteAudioElement"
  );

if (remoteAudioElement) {
  remoteAudioElement.pause();
  remoteAudioElement.srcObject = null;
}

updateVideoLayout();

videoElement.muted = true;
pipVideoElement.muted = true;

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
