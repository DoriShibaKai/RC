"use strict";

/*
  ==========================================
  非常停止状態にする
  ==========================================

  notifyPeer:
    true の場合は、DataChannelで相手にも
    emergency-stop を送る。

  通信が切れて相手へ送れない場合でも、
  この端末は必ず非常停止状態になる。
*/
function applyEmergencyStopState(options = {}) {
  const {
    notifyPeer = false,
    statusMessage =
      "非常停止中です。再開するには「解除」を押してください。"
  } = options;

  /*
    非常停止状態と画面表示を統一する。
  */
  applyDriveStopState(true);

  /*
    ラジコンへ停止命令を送る。
  */
  sendStopCommand();

  /*
    DataChannelが開いている場合は、
    相手側にも非常停止を通知する。
  */
  if (notifyPeer) {
    sendEmergencyStopMessage(
      "emergency-stop"
    );
  }

  if (
    !settingsPanel.open &&
    statusMessage
  ) {
    driveStatusElement.textContent =
      statusMessage;
  }
}


/*
  ==========================================
  非常停止を解除する
  ==========================================

  notifyPeer:
    true の場合は、DataChannelで相手にも
    emergency-stop-release を送る。

  片方の端末で解除すれば、
  相手側も同時に解除する。
*/
function clearEmergencyStopState(options = {}) {
  const {
    notifyPeer = false,
    statusMessage =
      "非常停止を解除しました。映像上をクリックして操作を再開してください。"
  } = options;

  /*
    非常停止状態と画面表示を解除する。
  */
  applyDriveStopState(false);

  /*
    通信断の検出済み状態も解除する。
    再び通信断した場合は、新しい通信断として検出する。
  */
  communicationLossTriggered = false;

  /*
    DataChannelが開いている場合は、
    相手側にも解除を通知する。
  */
  if (notifyPeer) {
    sendEmergencyStopMessage(
      "emergency-stop-release"
    );
  }

  if (
    !settingsPanel.open &&
    statusMessage
  ) {
    driveStatusElement.textContent =
      statusMessage;
  }
}


/*
  ==========================================
  通信断を検出したときの非常停止
  ==========================================

  PC側・iPhone側のどちらで通信断しても、
  この関数を呼ぶ。

  同じ通信断で何度もSTOP処理が走ることを防ぐ。
*/
function activateCommunicationLossStop(
  reason = "通信が途絶えました。"
) {
  if (
    communicationLossTriggered &&
    driveStopped
  ) {
    return;
  }

  communicationLossTriggered = true;

  applyEmergencyStopState({
    notifyPeer: true,

    statusMessage:
      reason +
      "\n" +
      "安全のため自動STOPしました。" +
      "通信回復後に「解除」を押してください。"
  });
}


/*
  ==========================================
  DataChannel通信監視を停止する
  ==========================================
*/
function stopDriveCommunicationWatchdog() {
  if (
    driveHeartbeatTimer !== null
  ) {
    clearInterval(
      driveHeartbeatTimer
    );

    driveHeartbeatTimer = null;
  }

  if (
    driveWatchdogTimer !== null
  ) {
    clearInterval(
      driveWatchdogTimer
    );

    driveWatchdogTimer = null;
  }

  lastDriveMessageReceivedAt = 0;

  /*
    driveStoppedは変更しない。

    通信監視を止めても、
    非常停止状態はそのまま保持する。
  */
}


/*
  ==========================================
  DataChannel通信監視を開始する
  ==========================================
*/
function startDriveCommunicationWatchdog() {
  stopDriveCommunicationWatchdog();

  lastDriveMessageReceivedAt =
    Date.now();

  /*
    一定間隔で相手へ生存確認を送る。
  */
  driveHeartbeatTimer =
    setInterval(
      () => {
        if (
          driveChannel &&
          driveChannel.readyState ===
            "open"
        ) {
          driveChannel.send(
            JSON.stringify({
              type: "heartbeat",
              sentAt: Date.now()
            })
          );
        }
      },
      DRIVE_HEARTBEAT_INTERVAL_MS
    );

  /*
    相手から一定時間メッセージが届かなければ、
    通信断として非常停止する。
  */
  driveWatchdogTimer =
    setInterval(
      () => {
        if (
          !driveChannel ||
          driveChannel.readyState !==
            "open"
        ) {
          activateCommunicationLossStop(
            "操作用通信が切断されました。"
          );

          return;
        }

        const silentTime =
          Date.now() -
          lastDriveMessageReceivedAt;

        if (
          silentTime >=
          DRIVE_COMMUNICATION_TIMEOUT_MS
        ) {
          activateCommunicationLossStop(
            "相手端末からの応答が途絶えました。"
          );
        }
      },
      DRIVE_WATCHDOG_CHECK_INTERVAL_MS
    );
}


/*
  ==========================================
  ラジコンへ停止命令を送る
  ==========================================

  BLE接続端末ではAtomへ停止座標を送る。

  DataChannelが開いている場合は、
  相手端末にも停止座標を送る。
*/
function sendStopCommand() {
  stopDriveCommandRepeater();

  currentDriveX = 0;
  currentDriveY = 0;

  console.warn(
    "★★ sendStopCommand実行 ★★",
    {
      time:
        new Date().toISOString(),

      role: role,

      pointerId:
        joystickPointerId,

      bleConnected:
        Boolean(
          bleCharacteristic
        ),

      dataChannelState:
        driveChannel
          ? driveChannel.readyState
          : "なし"
    }
  );

  console.warn(
    "★★ BLEへ停止座標を要求 X:128 Y:128 ★★"
  );

  /*
    BLE通信で停止命令が欠落しないように、
    少し間隔を空けて合計3回送る。
  */
  sendStopToBleWithRetry();

  if (
    driveChannel &&
    driveChannel.readyState ===
      "open"
  ) {
    driveSequence++;

    const stopData = {
      type: "drive",
      x: 0,
      y: 0,
      sequence: driveSequence
    };

    console.warn(
      "★★ WebRTCへ停止座標を送信 ★★",
      stopData
    );

    driveChannel.send(
      JSON.stringify(
        stopData
      )
    );
  } else {
    console.warn(
      "WebRTC停止座標は未送信：" +
      "DataChannelが開いていません"
    );
  }

  xyDisplay.textContent =
    "X：0.00　Y：0.00";

  joystickKnob.style.left =
    "50%";

  joystickKnob.style.top =
    "50%";

  joystickActive = false;
  joystickCandidate = false;
  joystickPointerId = null;

  joystickArea.style.display =
    "none";
}


/*
  ==========================================
  非常停止状態と画面表示を統一する
  ==========================================

  stopped === true
    非常停止中
    ボタン表示は「解除」

  stopped === false
    走行可能状態
    ボタン表示は「STOP」

  driveStoppedを直接変更する処理は、
  この関数だけに集約する。
*/
function applyDriveStopState(stopped) {
  stopDriveCommandRepeater();

  currentDriveX = 0;
  currentDriveY = 0;

  driveStopped = stopped;

  /*
    非常停止中は、
    白地・赤文字の「解除」表示にする。
  */
  driveStopButton.classList.toggle(
    "driveStoppedAppearance",
    stopped
  );

  /*
    操縦中または操作開始候補の状態を
    すべて解除する。
  */
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

    if (stopped) {
    driveStopButtonText.textContent =
      "解除";

    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "非常停止中です。" +
        "再開するには「解除」を押してください。";
    }

  } else {
    driveStopButtonText.textContent =
      "STOP";

    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "非常停止を解除しました。" +
        "映像上をクリックして操作を再開してください。";
    }
  }

  /*
    非常停止中は，
    設定でSTOPボタンを非表示にしていても
    「解除」ボタンを強制的に表示する。

    非常停止解除後は，
    元の表示設定へ戻す。
  */
  applyStopButtonVisibility();
}
