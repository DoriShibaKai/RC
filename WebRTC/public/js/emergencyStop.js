"use strict";

function applyEmergencyStopState(options = {}) {
  const {
    notifyPeer = false,
    statusMessage =
      "非常停止中です。再開するには「解除」を押してください。"
  } = options;

  applyDriveStopState(true);
  sendStopCommand();

  if (notifyPeer) {
    sendEmergencyStopMessage("emergency-stop");
  }

  if (!settingsPanel.open && statusMessage) {
    driveStatusElement.textContent = statusMessage;
  }
}


function clearEmergencyStopState(options = {}) {
  const {
    notifyPeer = false,
    statusMessage =
      "非常停止を解除しました。映像上をクリックして操作を再開してください。"
  } = options;

  applyDriveStopState(false);

  if (notifyPeer) {
    sendEmergencyStopMessage("emergency-stop-release");
  }

  if (!settingsPanel.open && statusMessage) {
    driveStatusElement.textContent = statusMessage;
  }
}


function activateCommunicationLossStop(reason = "通信が途絶えました。") {
  if (communicationLossTriggered && driveStopped) {
    return;
  }

  communicationLossTriggered = true;

  applyEmergencyStopState({
    notifyPeer: true,
    statusMessage:
      reason + "\n" +
      "安全のため自動STOPしました。通信回復後に「解除」を押してください。"
  });
}


function stopDriveCommunicationWatchdog() {
  if (driveHeartbeatTimer !== null) {
    clearInterval(driveHeartbeatTimer);
    driveHeartbeatTimer = null;
  }

  if (driveWatchdogTimer !== null) {
    clearInterval(driveWatchdogTimer);
    driveWatchdogTimer = null;
  }

  lastDriveMessageReceivedAt = 0;
  communicationLossTriggered = false;
}


function startDriveCommunicationWatchdog() {
  stopDriveCommunicationWatchdog();

  lastDriveMessageReceivedAt = Date.now();

  driveHeartbeatTimer = setInterval(() => {
    if (
      driveChannel &&
      driveChannel.readyState === "open"
    ) {
      driveChannel.send(
        JSON.stringify({
          type: "heartbeat",
          sentAt: Date.now()
        })
      );
    }
  }, DRIVE_HEARTBEAT_INTERVAL_MS);

  driveWatchdogTimer = setInterval(() => {
    if (
      !driveChannel ||
      driveChannel.readyState !== "open"
    ) {
      activateCommunicationLossStop();
      return;
    }

    const silentTime =
      Date.now() - lastDriveMessageReceivedAt;

    if (
      silentTime >=
      DRIVE_COMMUNICATION_TIMEOUT_MS
    ) {
      activateCommunicationLossStop();
    }
  }, DRIVE_WATCHDOG_CHECK_INTERVAL_MS);
}


function sendStopCommand() {
  stopDriveCommandRepeater();
  currentDriveX = 0;
  currentDriveY = 0;

  console.warn(
    "★★ sendStopCommand実行 ★★",
    {
      time: new Date().toISOString(),
      role: role,
      pointerId: joystickPointerId,
      bleConnected: Boolean(bleCharacteristic),
      dataChannelState:
        driveChannel
          ? driveChannel.readyState
          : "なし"
    }
  );

  // この端末がBLE接続中なら，停止座標を直接Atomへ送る
  console.warn(
    "★★ BLEへ停止座標を要求 X:128 Y:128 ★★"
  );

  /*
  停止座標はBLE通信で欠落しないように，
  少し間隔を空けて合計3回送る
*/
sendStopToBleWithRetry();

  if (
    driveChannel &&
    driveChannel.readyState === "open"
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
      JSON.stringify(stopData)
    );
  } else {
    console.warn(
      "WebRTC停止座標は未送信：DataChannelが開いていません"
    );
  }

  xyDisplay.textContent =
    "X：0.00　Y：0.00";

  joystickKnob.style.left = "50%";
  joystickKnob.style.top = "50%";

  joystickActive = false;
}


function applyDriveStopState(stopped) {
  stopDriveCommandRepeater();
  currentDriveX = 0;
  currentDriveY = 0;

  driveStopped = stopped;

  /*
    非常停止中は，
    白地・赤文字の「解除」表示に切り替える
  */
  driveStopButton.classList.toggle(
    "driveStoppedAppearance",
    stopped
  );

  /*
    操縦中・ジョイスティック候補状態を
    どちらも解除する
  */

  joystickActive = false;
  joystickCandidate = false;
  joystickPointerId = null;

  joystickArea.style.display = "none";

  joystickKnob.style.left = "50%";
  joystickKnob.style.top = "50%";

  xyDisplay.textContent = "X：0.00　Y：0.00";

  if (stopped) {
    xyDisplay.textContent = "X：0.00　Y：0.00";

    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";

    driveStopButtonText.textContent = "解除";

    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "非常停止中です。再開するには「解除」を押してください。";
    }

  } else {

    driveStopButtonText.textContent = "STOP";

    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "非常停止を解除しました。映像上をクリックして操作を再開してください。";
    }
  }
}
