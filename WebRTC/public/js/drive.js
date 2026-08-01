"use strict";


/*
  ==========================================
  現在の操縦座標を送信する
  ==========================================

  非常停止中またはジョイスティックを
  操作していない場合は送信しない。
*/
function transmitCurrentDriveCoordinates() {
  if (
    driveStopped ||
    !joystickActive
  ) {
    return;
  }

  /*
    選択した速度倍率を座標へ掛ける。

    方向は変えず、
    最大速度だけを制限する。
  */
  const scaledDriveX =
    currentDriveX *
    driveSpeedScale;

  const scaledDriveY =
    currentDriveY *
    driveSpeedScale;

  /*
    この端末がBLE接続中なら、
    Atomへ直接送信する。
  */
  sendCoordinatesToBle(
    scaledDriveX,
    scaledDriveY
  );

  /*
    DataChannelが開いている場合は、
    相手側にも同じ座標を送信する。
  */
  driveSequence++;

  sendDriveChannelPayload({
    type: "drive",
    x: scaledDriveX,
    y: scaledDriveY,
    sequence: driveSequence
  });
}


/*
  ==========================================
  操縦座標の連続送信を停止する
  ==========================================
*/
function stopDriveCommandRepeater() {
  if (
    driveCommandRepeatTimer === null
  ) {
    return;
  }

  clearInterval(
    driveCommandRepeatTimer
  );

  driveCommandRepeatTimer = null;
}


/*
  ==========================================
  操縦座標を更新して連続送信する
  ==========================================
*/
function updateAndRepeatDriveCoordinates(
  x,
  y
) {
  currentDriveX =
    Number(x) || 0;

  currentDriveY =
    Number(y) || 0;

  transmitCurrentDriveCoordinates();

  if (
    driveCommandRepeatTimer !== null
  ) {
    return;
  }

  driveCommandRepeatTimer =
    setInterval(
      () => {
        transmitCurrentDriveCoordinates();
      },
      DRIVE_COMMAND_REPEAT_INTERVAL_MS
    );
}


/*
  ==========================================
  STOPボタンの使用可否を更新する
  ==========================================
*/
function updateDriveStopButtonAvailability() {
  /*
    STOPボタンの位置・サイズ編集中は、
    ドラッグやリサイズを行うため有効にする。

    編集中にボタンを押しても、
    非常停止処理は実行しない。
  */
  if (stopEditorActive) {
    driveStopButton.disabled = false;
    return;
  }

  const channelConnected =
    isDriveChannelOpen();

  const settingsActive =
    settingsPanel.open ||
    remoteSettingsActive;

  /*
    DataChannelが未接続の場合、
    またはどちらかの端末が詳細設定中の場合は
    STOPボタンを使用不可にする。
  */
  driveStopButton.disabled =
    !channelConnected ||
    settingsActive;
}


/*
  ==========================================
  詳細設定中の走行を停止する
  ==========================================

  詳細設定を開いた場合は、
  非常停止状態へ移行する。

  詳細設定を閉じても、
  自動では非常停止を解除しない。
*/
function stopDrivingForSettings() {
  if (!settingsPanel.open) {
    return;
  }

  /*
    詳細設定中は解除ボタンを使用不可にする。
  */
  updateDriveStopButtonAvailability();

  /*
    driveStoppedを直接変更せず、
    共通の非常停止関数を使用する。

    applyEmergencyStopState()の中で、
    BLEとDataChannelへ停止命令も送られる。
  */
  applyEmergencyStopState({
    notifyPeer: false,

    statusMessage:
      "詳細設定中です。" +
      "操縦は一時停止しています。"
  });

  /*
    相手側へ詳細設定中であることを通知する。
  */
  sendSettingsState(true);
}


/*
  ==========================================
  BLEへ操縦座標を送る
  ==========================================
*/
function sendCoordinatesToBle(
  x,
  y
) {
  if (!bleCharacteristic) {
    return;
  }

  /*
    座標を-1～1の範囲に制限する。
  */
  const safeX =
    Math.max(
      -1,
      Math.min(
        1,
        Number(x) || 0
      )
    );

  const safeY =
    Math.max(
      -1,
      Math.min(
        1,
        Number(y) || 0
      )
    );

  /*
    新しい移動座標が来た場合は、
    予約されている古い停止再送を中止する。
  */
  if (
    safeX !== 0 ||
    safeY !== 0
  ) {
    cancelRemoteStopResend();
  }

  /*
    -1～1の座標を、
    Atomへ送る0～255へ変換する。
  */
  pendingBleCoordinates =
    new Uint8Array([
      Math.round(
        (safeX + 1) *
        127.5
      ),

      Math.round(
        (safeY + 1) *
        127.5
      )
    ]);

  processBleCoordinateQueue();
}


/*
  ==========================================
  ジョイスティック操作を終了する
  ==========================================
*/
function finishJoystickPointer(
  event,
  wasCancelled = false
) {
  if (
    joystickPointerId !==
    event.pointerId
  ) {
    return;
  }

  /*
    操作量や終了理由に関係なく、
    マウスまたは指を離したら
    必ず停止命令を送る。
  */
  sendStopCommand();

  joystickCandidate = false;
  joystickActive = false;
  joystickPointerId = null;

  joystickArea.style.display =
    "none";

  joystickKnob.style.left =
    "50%";

  joystickKnob.style.top =
    "50%";

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


/*
  ==========================================
  STOP／解除ボタンを押したとき
  ==========================================

  STOPを押した場合：
    自端末を非常停止にし、
    相手へemergency-stopを送る。

  解除を押した場合：
    自端末の非常停止を解除し、
    相手へemergency-stop-releaseを送る。

  どちらか一方で押せば、
  両方の端末が同じ状態になる。
*/
function toggleDriveStop(event) {
  event.preventDefault();
  event.stopPropagation();

  /*
    STOPボタン編集中は、
    非常停止処理を実行しない。
  */
  if (stopEditorActive) {
    return;
  }

  /*
    自分または相手が詳細設定中の場合は、
    非常停止を解除できない。
  */
  if (
    settingsPanel.open ||
    remoteSettingsActive
  ) {
    return;
  }

  if (driveStopped) {
    /*
      現在が非常停止中なので解除する。

      解除情報はDataChannelで相手にも送信する。
    */
    clearEmergencyStopState({
      notifyPeer: true,

      statusMessage:
        "非常停止を解除しました。" +
        "映像上をクリックして操作を再開してください。"
    });

    return;
  }

  /*
    現在が走行可能状態なので非常停止する。

    非常停止情報はDataChannelで相手にも送信する。
  */
  applyEmergencyStopState({
    notifyPeer: true,

    statusMessage:
      "非常停止中です。" +
      "再開するには「解除」を押してください。"
  });
}
