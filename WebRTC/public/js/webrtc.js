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
  受信側が取得したマイク専用ストリーム。

  送信側は，既存のlocalStream内に
  カメラとマイクの両方を持つ。
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

  let microphoneTrack =
    getExistingMicrophoneTrack();

  /*
    接続中に初めてONにした場合は，
    ここでマイクを取得する。
  */
  if (
    microphoneEnabled &&
    role !== null &&
    !microphoneTrack
  ) {
    microphoneTrack =
      await ensureMicrophoneTrack();
  }

  if (microphoneTrack) {
    microphoneTrack.enabled =
      microphoneEnabled;
  }

  /*
    受信側では，PCのマイクトラックを
    音声送信用senderへ設定する。
  */
  if (
    role === "viewer" &&
    peerConnection
  ) {
    const transceiver =
      findLocalAudioTransceiver();

    if (
      transceiver &&
      transceiver.sender
    ) {
      await transceiver.sender
        .replaceTrack(
          microphoneTrack || null
        );
    }

    /*
      接続完了後にPCマイクをONにした場合は，
      新しい音声送信状態をiPhone側へ
     伝えるため再ネゴシエーションする。
    */
    if (
      microphoneEnabled &&
      peerConnection.signalingState ===
        "stable"
    ) {
      await renegotiateViewerAudio();
    }
  }

  updateMicrophoneSettingsDisplay();

  if (microphoneEnabled) {
    setStatus(
      "マイク送信をONにしました。"
    );
  } else {
    setStatus(
      "マイク送信をOFFにしました。"
    );
  }
}


/*
  PC側のマイク送信開始を，
  新しいOfferとしてiPhone側へ通知する。
*/
async function renegotiateViewerAudio() {
  if (
    role !== "viewer" ||
    !peerConnection ||
    peerConnection.signalingState !==
      "stable"
  ) {
    return;
  }

  const connection =
    peerConnection;

  const offer =
    await connection.createOffer();

  if (
    peerConnection !== connection
  ) {
    return;
  }

  await connection
    .setLocalDescription(offer);

  sendSignal({
    type: "viewer-audio-offer",
    offer:
      connection.localDescription
  });
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
    const [remoteStream] =
      event.streams;

    /*
      カメラ受信側。

      相手の映像と相手の音声を
      同じvideo要素で再生する。
    */
    if (role === "viewer") {
      let viewerStream =
        remoteStream;

      if (!viewerStream) {
        if (
          videoElement.srcObject
          instanceof MediaStream
        ) {
          viewerStream =
            videoElement.srcObject;
        } else {
          viewerStream =
            new MediaStream();
        }

        const alreadyAdded =
          viewerStream
            .getTracks()
            .some(
              track =>
                track.id ===
                event.track.id
            );

        if (!alreadyAdded) {
          viewerStream.addTrack(
            event.track
          );
        }
      }

      videoElement.srcObject =
        viewerStream;

      videoElement.muted = false;
      videoElement.defaultMuted = false;

      videoElement.removeAttribute(
        "muted"
      );

      videoElement.volume = 1;

      videoElement.classList.remove(
        "hidden"
      );

      scheduleStopButtonGeometryApply();

      videoElement.play()
        .then(() => {
          scheduleStopButtonGeometryApply();
        })
        .catch(error => {
          console.warn(
            "映像・音声を再生できませんでした。",
            error
          );

          setStatus(
            "映像と音声を受信しました。\n" +
            "音声が出ない場合は，映像部分を一度押してください。"
          );
        });

      return;
    }


    /*
      カメラ送信側。

      自分のカメラ映像に，
      相手から届いた音声だけを組み合わせる。

      自分のマイク音声は入れないので，
      自分の声が自分から再生されることはない。
    */
    if (
      role === "sender" &&
      event.track.kind === "audio"
    ) {
      const senderPlaybackStream =
        new MediaStream();

      /*
        自分のカメラ映像だけを追加する。
        localStream内のマイクは追加しない。
      */
      if (localStream) {
        for (
          const videoTrack
          of localStream.getVideoTracks()
        ) {
          senderPlaybackStream.addTrack(
            videoTrack
          );
        }
      }

      /*
        相手から届いた音声を追加する。
      */
      senderPlaybackStream.addTrack(
        event.track
      );

      videoElement.srcObject =
        senderPlaybackStream;

      videoElement.muted = false;
      videoElement.defaultMuted = false;

      videoElement.removeAttribute(
        "muted"
      );

      videoElement.volume = 1;

      videoElement.classList.remove(
        "hidden"
      );

      scheduleStopButtonGeometryApply();

      videoElement.play()
        .then(() => {
          scheduleStopButtonGeometryApply();
        })
        .catch(error => {
          console.warn(
            "相手音声を再生できませんでした。",
            error
          );

          setStatus(
            "相手の音声を受信しました。\n" +
            "音声が出ない場合は，映像部分を一度押してください。"
          );
        });
    }
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


async function rebuildPeerConnectionForReconnect() {
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

  /*
    相手音声を受信しながら，
    この端末のマイク音声も送れるようにする。
  */
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


/*
  PC側がマイク送信を開始したときの
  再ネゴシエーションOffer。
*/
if (
  message.type ===
    "viewer-audio-offer" &&
  role === "sender"
) {
  if (!peerConnection) {
    return;
  }

  const connection =
    peerConnection;

  await connection
    .setRemoteDescription(
      message.offer
    );

  const answer =
    await connection.createAnswer();

  await connection
    .setLocalDescription(answer);

  sendSignal({
    type: "viewer-audio-answer",
    answer:
      connection.localDescription
  });

  return;
}


/*
  iPhone側から返されたAnswerを
  PC側へ反映する。
*/
if (
  message.type ===
    "viewer-audio-answer" &&
  role === "viewer"
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

      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

/*
  保存されているマイク設定を反映する。

  初期値はOFFなので，
  許可済みでも音声は相手へ送らない。
*/
for (
  const audioTrack
  of localStream.getAudioTracks()
) {
  audioTrack.enabled =
    microphoneEnabled;
}

updateMicrophoneSettingsDisplay();

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

/*
  音声だけは双方向にする。
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
    "パソコンのマイク使用許可を確認しています。"
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
