"use strict";

function isDriveChannelOpen() {
  return Boolean(
    driveChannel &&
    driveChannel.readyState === "open"
  );
}


function sendDriveChannelPayload(payload) {
  if (!isDriveChannelOpen()) {
    return false;
  }

  driveChannel.send(JSON.stringify(payload));
  return true;
}


function closeDriveChannelSafely() {
  if (!driveChannel) {
    return;
  }

  driveChannel.onopen = null;
  driveChannel.onclosing = null;
  driveChannel.onclose = null;
  driveChannel.onerror = null;
  driveChannel.onmessage = null;

  if (driveChannel.readyState !== "closed") {
    try {
      driveChannel.close();
    } catch (error) {
      console.warn("DataChannelを閉じられませんでした。", error);
    }
  }

  driveChannel = null;
}


function configureDriveChannel(channel, sideLabel, onConnected) {
  driveChannel = channel;

  const handleOpen = () => {
    console.log(`${sideLabel} DataChannel 接続`, driveChannel.readyState);

    driveStopButton.disabled = false;
    startDriveCommunicationWatchdog();

    if (driveStopped) {
      sendEmergencyStopMessage("emergency-stop");
      sendStopCommand();
    }

    headerBadgeDot.classList.remove("connecting");
    headerBadgeDot.classList.add("connected");

    onConnected();

    if (settingsPanel.open) {
      stopDrivingForSettings();
    }
  };

  if (driveChannel.readyState === "open") {
    handleOpen();
  } else {
    driveChannel.onopen = handleOpen;
  }

  driveChannel.onclosing = () => {
    console.log(`${sideLabel} DataChannel closing`);
    activateCommunicationLossStop();
  };

  driveChannel.onclose = () => {
    console.log(`${sideLabel} DataChannel 切断`);
    activateCommunicationLossStop();
  };

  driveChannel.onerror = error => {
    console.error(`${sideLabel} DataChannel error`, error);
    activateCommunicationLossStop();
  };

  driveChannel.onmessage = handleDriveChannelMessage;
}


function markDriveCommunicationReceived() {
  lastDriveMessageReceivedAt = Date.now();
  communicationLossTriggered = false;
}


function sendEmergencyStopMessage(type) {
  driveSequence++;

  return sendDriveChannelPayload({
    type,
    sequence: driveSequence
  });
}


function sendSettingsState(active) {

  if (
    !driveChannel ||
    driveChannel.readyState !== "open"
  ) {
    return;
  }

  driveSequence++;

  const settingsStateData = {
    type: "settings-state",
    active: active,
    sequence: driveSequence
  };

  driveChannel.send(
    JSON.stringify(settingsStateData)
  );
}


function sendDriveStopState(stopped) {
  return sendEmergencyStopMessage(
    stopped
      ? "emergency-stop"
      : "emergency-stop-release"
  );
}


function handleDriveChannelMessage(event) {
  console.log("受信", event.data);

  markDriveCommunicationReceived();

  try {
    const command = JSON.parse(event.data);

    console.log("受信した命令", command);

    // 生存確認だけのメッセージは操縦処理を行わない
    if (command.type === "heartbeat") {
      return;
    }

    // 相手が「接続を終了」を押した場合
if (command.type === "disconnect-all") {

  // 回線を閉じる前に，受信確認を返信する
  sendDriveChannelPayload({
    type: "disconnect-ack"
  });

  setStatus(
    "相手側が接続を終了しました。\n" +
    "この端末側の接続も終了しました。"
  );

  // ACKが送信キューに入る時間を少し確保してから終了する
  setTimeout(() => {
    stopAll(false);
  }, 200);

  return;
}

// 自分が送った切断要求の確認応答を受信した場合
if (command.type === "disconnect-ack") {

  if (disconnectAckTimer) {
    clearTimeout(disconnectAckTimer);
    disconnectAckTimer = null;
  }

  disconnectRequestPending = false;
  stopAll(true);
  return;
}

   // 詳細設定の開閉状態を受信した場合
if (command.type === "settings-state") {

  remoteSettingsActive =
    command.active === true;

  // 相手が詳細設定中なら，
  // 自分側の解除ボタンも使用不可にする
  updateDriveStopButtonAvailability();

  if (remoteSettingsActive) {

    applyDriveStopState(true);

    driveStatusElement.textContent =
      "詳細設定中です。操縦は一時停止しています。";

  } else {

    driveStatusElement.textContent =
      "詳細設定を終了しました。「解除」を押すと操縦を再開できます。";
  }

  return;
}

// 非常停止を受信した場合
if (command.type === "emergency-stop") {
  applyEmergencyStopState({
    notifyPeer: false,
    statusMessage:
      "相手側または通信監視により非常停止しました。\n" +
      "再開するには「解除」を押してください。"
  });
  return;
}

// 非常停止解除を受信した場合
if (command.type === "emergency-stop-release") {
  clearEmergencyStopState({
    notifyPeer: false
  });
  return;
}

/*
  旧形式との互換性を残す。
  新しい端末同士では上記2種類を使用する。
*/
if (command.type === "drive-stop-state") {
  if (command.stopped === true) {
    applyEmergencyStopState({
      notifyPeer: false
    });
  } else {
    clearEmergencyStopState({
      notifyPeer: false
    });
  }
  return;
}

    // 操縦命令を受信した場合
if (command.type === "drive") {

  // 非常停止中は，0以外の操縦命令をすべて無視する
  if (
    driveStopped &&
    (command.x !== 0 || command.y !== 0)
  ) {
    console.log(
      "非常停止中のため操縦命令を無視しました",
      command
    );

    driveStatusElement.textContent =
      "非常停止中です。操縦命令を無視しました。";

    return;
  }

  driveStatusElement.textContent =
    "操縦命令を受信しました。\n" +
    "X：" + command.x + "\n" +
    "Y：" + command.y + "\n" +
    "sequence：" + command.sequence;

  const isStopCommand =
    command.x === 0 &&
    command.y === 0;

  if (!isStopCommand) {
    /*
      新しい移動命令が来た場合は，
      古い停止座標の予約再送を中止する。
    */
    cancelRemoteStopResend();

    sendCoordinatesToBle(
      command.x,
      command.y
    );

    return;
  }

  sendStopToBleWithRetry();
}

  } catch (error) {
    console.error(
      "受信データをJSONとして読めませんでした",
      error
    );

    setStatus("受信データの読み取りに失敗しました。");
  }
}
