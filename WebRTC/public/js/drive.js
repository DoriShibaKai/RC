"use strict";

function transmitCurrentDriveCoordinates() {
  if (
    driveStopped ||
    !joystickActive
  ) {
    return;
  }

  /*
    選択した速度倍率を座標へ掛ける。
    方向は変えず，最大速度だけを制限する。
  */
  const scaledDriveX =
    currentDriveX * driveSpeedScale;

  const scaledDriveY =
    currentDriveY * driveSpeedScale;

  // この端末がBLE接続中ならAtomへ直接送る
  sendCoordinatesToBle(
    scaledDriveX,
    scaledDriveY
  );

  // WebRTC接続中なら相手側にも同じ座標を送る
  if (
    driveChannel &&
    driveChannel.readyState === "open"
  ) {
    driveSequence++;

    const driveData = {
      type: "drive",
      x: scaledDriveX,
      y: scaledDriveY,
      sequence: driveSequence
    };

    driveChannel.send(
      JSON.stringify(driveData)
    );
  }
}


function stopDriveCommandRepeater() {
  if (driveCommandRepeatTimer !== null) {
    clearInterval(driveCommandRepeatTimer);
    driveCommandRepeatTimer = null;
  }
}


function updateAndRepeatDriveCoordinates(x, y) {
  currentDriveX = Number(x) || 0;
  currentDriveY = Number(y) || 0;

  transmitCurrentDriveCoordinates();

  if (driveCommandRepeatTimer !== null) {
    return;
  }

  driveCommandRepeatTimer = setInterval(() => {
    transmitCurrentDriveCoordinates();
  }, DRIVE_COMMAND_REPEAT_INTERVAL_MS);
}


function updateDriveStopButtonAvailability() {

  /*
    編集中はドラッグ・リサイズのため，
    STOPボタンを操作可能にする。
    押しても非常停止処理は実行しない。
  */
  if (stopEditorActive) {
    driveStopButton.disabled = false;
    return;
  }

  const channelConnected =
    driveChannel &&
    driveChannel.readyState === "open";

  const settingsActive =
    settingsPanel.open ||
    remoteSettingsActive;

  driveStopButton.disabled =
    !channelConnected ||
    settingsActive;
}


function stopDrivingForSettings() {

  if (!settingsPanel.open) {
    return;
  }

  // 詳細設定中はSTOP解除ボタンを使用不可にする
  updateDriveStopButtonAvailability();

  // 自分側を停止状態にする
  applyDriveStopState(true);

  if (
    driveChannel &&
    driveChannel.readyState === "open"
  ) {
    // 相手へ停止命令を送る
    sendStopCommand();

    // 「詳細設定を開いた」ことを相手へ送る
    sendSettingsState(true);
  }

  driveStatusElement.textContent =
    "詳細設定中です。操縦は一時停止しています。";
}


function sendCoordinatesToBle(x, y) {
  if (!bleCharacteristic) {
    return;
  }

  const safeX = Math.max(-1, Math.min(1, Number(x) || 0));
  const safeY = Math.max(-1, Math.min(1, Number(y) || 0));

  /*
  新しい移動座標が来たら，
  予約されている古い停止再送を中止する
*/
if (safeX !== 0 || safeY !== 0) {
  cancelRemoteStopResend();
}

  pendingBleCoordinates = new Uint8Array([
    Math.round((safeX + 1) * 127.5),
    Math.round((safeY + 1) * 127.5)
  ]);

  processBleCoordinateQueue();
}


function finishJoystickPointer(
  event,
  wasCancelled = false
) {

  if (
    joystickPointerId !== event.pointerId
  ) {
    return;
  }

  /*
  操作量に関係なく，
  マウスまたは指を離したら必ず停止座標を送る
*/
sendStopCommand();

  joystickCandidate = false;
  joystickActive = false;
  joystickPointerId = null;

  joystickArea.style.display = "none";

  joystickKnob.style.left = "50%";
  joystickKnob.style.top = "50%";

  xyDisplay.textContent =
    "X：0.00　Y：0.00";

  try {

    if (
      videoWrapper.hasPointerCapture(
        event.pointerId
      )
    ) {
      videoWrapper.releasePointerCapture(
        event.pointerId
      );
    }

  } catch (error) {

    console.log(
      "Pointer Captureを解除できませんでした。",
      error
    );
  }
}


function toggleDriveStop(event) {
  event.preventDefault();
  event.stopPropagation();

  // STOPボタン編集中は操作しない
  if (stopEditorActive) {
    return;
  }

  // 自分または相手が詳細設定中なら解除しない
  if (
    settingsPanel.open ||
    remoteSettingsActive
  ) {
    return;
  }

  const newStoppedState = !driveStopped;

  if (newStoppedState) {
    applyEmergencyStopState({
      notifyPeer: true
    });
  } else {
    clearEmergencyStopState({
      notifyPeer: true
    });
  }
}
