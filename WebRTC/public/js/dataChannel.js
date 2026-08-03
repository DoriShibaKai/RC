"use strict";


/*
  ==========================================
  DataChannelが送信可能か確認する
  ==========================================
*/
function isDriveChannelOpen() {
  return Boolean(
    driveChannel &&
    driveChannel.readyState === "open"
  );
}


/*
  ==========================================
  DataChannelへ共通形式で送信する
  ==========================================

  送信できた場合は true、
  接続されていない場合は false を返す。
*/
function sendDriveChannelPayload(payload) {
  if (!isDriveChannelOpen()) {
    return false;
  }

  try {
    driveChannel.send(
      JSON.stringify(payload)
    );

    return true;
  } catch (error) {
    console.error(
      "DataChannelの送信に失敗しました。",
      error
    );

    return false;
  }
}


/*
  ==========================================
  DataChannelを安全に閉じる
  ==========================================

  ユーザーが明示的に接続終了した場合などに使用する。

  イベントを解除してから閉じるため、
  この処理自体では通信断非常停止を発生させない。
*/
function closeDriveChannelSafely() {
  if (!driveChannel) {
    return;
  }

  const channelToClose =
    driveChannel;

  channelToClose.onopen = null;
  channelToClose.onclosing = null;
  channelToClose.onclose = null;
  channelToClose.onerror = null;
  channelToClose.onmessage = null;

  if (
    channelToClose.readyState !==
    "closed"
  ) {
    try {
      channelToClose.close();
    } catch (error) {
      console.warn(
        "DataChannelを閉じられませんでした。",
        error
      );
    }
  }

  if (driveChannel === channelToClose) {
    driveChannel = null;
  }
}


/*
  ==========================================
  DataChannelのイベントを設定する
  ==========================================

  送信側・受信側の両方で、
  必ずこの共通関数を使用する。
*/
function configureDriveChannel(
  channel,
  sideLabel,
  onConnected
) {
  driveChannel = channel;

  const configuredChannel =
    channel;

  const handleOpen = () => {
    /*
      古いDataChannelのイベントが
      遅れて発生した場合は無視する。
    */
    if (
      driveChannel !==
      configuredChannel
    ) {
      return;
    }

    console.log(
      `${sideLabel} DataChannel 接続`,
      configuredChannel.readyState
    );

    driveStopButton.disabled = false;

    startDriveCommunicationWatchdog();

    /*
      再接続時に非常停止中だった場合は、
      状態を解除せず相手へ通知する。

      映像やWebRTCが復旧しても、
      自動で走行可能状態へ戻さない。
    */
    if (driveStopped) {
      sendEmergencyStopMessage(
        "emergency-stop"
      );

      sendStopCommand();
    }

    headerBadgeDot.classList.remove(
      "connecting"
    );

    headerBadgeDot.classList.add(
      "connected"
    );

    if (
      typeof onConnected ===
      "function"
    ) {
      onConnected();
    }

    /*
     接続した相手へ，
     現在の共通走行速度を通知する。
    */
    sendDriveSpeedState();

    if (settingsPanel.open) {
      stopDrivingForSettings();
    }

    
  };

  if (
    configuredChannel.readyState ===
    "open"
  ) {
    handleOpen();
  } else {
    configuredChannel.onopen =
      handleOpen;
  }

  configuredChannel.onclosing =
    () => {
      if (
        driveChannel !==
        configuredChannel
      ) {
        return;
      }

      console.log(
        `${sideLabel} DataChannel closing`
      );

      activateCommunicationLossStop(
        "操作用通信が切断されようとしています。"
      );
    };

  configuredChannel.onclose =
    () => {
      if (
        driveChannel !==
        configuredChannel
      ) {
        return;
      }

      console.log(
        `${sideLabel} DataChannel 切断`
      );

      activateCommunicationLossStop(
        "操作用通信が切断されました。"
      );
    };

  configuredChannel.onerror =
    error => {
      if (
        driveChannel !==
        configuredChannel
      ) {
        return;
      }

      console.error(
        `${sideLabel} DataChannel error`,
        error
      );

      activateCommunicationLossStop(
        "操作用通信でエラーが発生しました。"
      );
    };

  configuredChannel.onmessage =
    handleDriveChannelMessage;
}


/*
  ==========================================
  相手から通信を受信した時刻を記録する
  ==========================================

  通信が届いたことだけを記録する。

  driveStoppedは変更しないため、
  再接続しても非常停止状態は保持される。
*/
function markDriveCommunicationReceived() {
  lastDriveMessageReceivedAt =
    Date.now();
}


/*
  ==========================================
  非常停止・解除を相手へ送信する
  ==========================================
*/
function sendEmergencyStopMessage(type) {
  if (
    type !== "emergency-stop" &&
    type !==
      "emergency-stop-release"
  ) {
    console.warn(
      "不正な非常停止メッセージです。",
      type
    );

    return false;
  }

  driveSequence++;

  return sendDriveChannelPayload({
    type: type,
    sequence: driveSequence
  });
}


/*
  ==========================================
  詳細設定の開閉状態を送信する
  ==========================================
*/
function sendSettingsState(active) {
  driveSequence++;

  return sendDriveChannelPayload({
    type: "settings-state",
    active: active === true,
    sequence: driveSequence
  });
}

/*
  ==========================================
  走行速度を相手へ送信する
  ==========================================

  走行速度は部屋全体の共有設定とし，
  最後に変更された値を相手側にも反映する。
*/
function sendDriveSpeedState() {

  driveSequence++;

  return sendDriveChannelPayload({
    type: "drive-speed-state",
    speed: driveSpeedScale,
    sequence: driveSequence
  });
}

/*
  ==========================================
  非常停止状態を送信する互換関数
  ==========================================
*/
function sendDriveStopState(stopped) {
  return sendEmergencyStopMessage(
    stopped
      ? "emergency-stop"
      : "emergency-stop-release"
  );
}


/*
  ==========================================
  DataChannelメッセージを受信する
  ==========================================
*/
function handleDriveChannelMessage(event) {
  console.log(
    "DataChannel受信",
    event.data
  );

  markDriveCommunicationReceived();

  let command;

  try {
    command =
      JSON.parse(event.data);
  } catch (error) {
    console.error(
      "受信データをJSONとして読めませんでした。",
      error
    );

    setStatus(
      "受信データの読み取りに失敗しました。"
    );

    return;
  }

  console.log(
    "受信した命令",
    command
  );

  /*
    生存確認メッセージ。

    操縦状態や非常停止状態は変更しない。
  */
  if (
    command.type ===
    "heartbeat"
  ) {
    return;
  }

  /*
    ========================================
    相手が「すべて切断」を押した
    ========================================
  */
  if (
    command.type ===
    "disconnect-all"
  ) {
    /*
      回線を閉じる前に、
      受信確認を相手へ返信する。
    */
    sendDriveChannelPayload({
      type: "disconnect-ack"
    });

    setStatus(
      "相手側が接続を終了しました。\n" +
      "この端末側の接続も終了しました。"
    );

    /*
      明示的な接続終了なので、
      通常の初期状態へ戻してよい。
    */
    setTimeout(
      () => {
        stopAll(false);
      },
      200
    );

    return;
  }

  /*
    ========================================
    切断要求への確認応答
    ========================================
  */
  if (
    command.type ===
    "disconnect-ack"
  ) {
    if (disconnectAckTimer) {
      clearTimeout(
        disconnectAckTimer
      );

      disconnectAckTimer = null;
    }

    disconnectRequestPending =
      false;

    /*
      自分が明示的に接続終了したため、
      通常の初期状態へ戻す。
    */
    stopAll(true);

    return;
  }

  /*
    ========================================
    詳細設定の開閉状態
    ========================================
  */
  if (
    command.type ===
    "settings-state"
  ) {
    remoteSettingsActive =
      command.active === true;

    updateDriveStopButtonAvailability();

    if (remoteSettingsActive) {
      /*
        詳細設定中は安全のため非常停止にする。

        driveStoppedを直接変更せず、
        共通の非常停止関数を使う。
      */
      applyEmergencyStopState({
        notifyPeer: false,

        statusMessage:
          "相手側が詳細設定中です。" +
          "操縦は一時停止しています。"
      });

      return;
    }

    /*
      詳細設定が終わっても、
      自動では非常停止を解除しない。

      ユーザーが「解除」を押した時だけ解除する。
    */
    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "詳細設定を終了しました。" +
        "「解除」を押すと操縦を再開できます。";
    }

    return;
  }

  /*
  ========================================
  相手が変更した走行速度
  ========================================
*/
if (
  command.type ===
  "drive-speed-state"
) {

  const receivedSpeed =
    Number(command.speed);

  /*
    現在用意している速度だけを受け付ける。
  */
  const allowedSpeeds = [
    0.25,
    1.0
  ];

  if (
    !Number.isFinite(receivedSpeed) ||
    !allowedSpeeds.includes(
      receivedSpeed
    )
  ) {

    console.warn(
      "不正な走行速度を受信しました。",
      command
    );

    return;
  }

  /*
    実際に使用する速度を更新する。
  */
  driveSpeedScale =
    receivedSpeed;

  /*
    自分側の詳細設定表示も，
    相手が最後に変更した速度へ合わせる。
  */
 const matchingSpeedOption =
  Array.from(
    driveSpeedSelect.options
  ).find(
    option =>
      Number(option.value) ===
      receivedSpeed
  );

if (matchingSpeedOption) {
  driveSpeedSelect.value =
    matchingSpeedOption.value;
}

  /*
    この端末を次回開いたときにも，
    共通速度を表示できるよう保存する。
  */
  localStorage.setItem(
  "driveSpeedScale",
  matchingSpeedOption
    ? matchingSpeedOption.value
    : String(receivedSpeed)
);

  console.log(
    "相手の走行速度を反映:",
    receivedSpeed
  );

  return;
}

  /*
    ========================================
    相手から非常停止を受信
    ========================================
  */
  if (
    command.type ===
    "emergency-stop"
  ) {
    applyEmergencyStopState({
      notifyPeer: false,

      statusMessage:
        "相手側または通信監視により" +
        "非常停止しました。\n" +
        "再開するには「解除」を押してください。"
    });

    return;
  }

  /*
    ========================================
    相手から非常停止解除を受信
    ========================================
  */
  if (
    command.type ===
    "emergency-stop-release"
  ) {
    clearEmergencyStopState({
      notifyPeer: false,

      statusMessage:
        "相手側で非常停止が解除されました。" +
        "操作を再開できます。"
    });

    return;
  }

  /*
    ========================================
    旧形式との互換性
    ========================================

    新しい端末同士では、
    emergency-stopと
    emergency-stop-releaseを使用する。
  */
  if (
    command.type ===
    "drive-stop-state"
  ) {
    if (
      command.stopped === true
    ) {
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

  /*
    ========================================
    操縦命令
    ========================================
  */
  if (
    command.type ===
    "drive"
  ) {
    const commandX =
      Number(command.x);

    const commandY =
      Number(command.y);

    if (
      !Number.isFinite(commandX) ||
      !Number.isFinite(commandY)
    ) {
      console.warn(
        "不正な操縦座標を受信しました。",
        command
      );

      return;
    }

    const isStopCommand =
      commandX === 0 &&
      commandY === 0;

    /*
      非常停止中は、
      停止座標以外の命令をすべて無視する。
    */
    if (
      driveStopped &&
      !isStopCommand
    ) {
      console.log(
        "非常停止中のため操縦命令を無視しました。",
        command
      );

      if (!settingsPanel.open) {
        driveStatusElement.textContent =
          "非常停止中です。" +
          "操縦命令を無視しました。";
      }

      return;
    }

    if (!settingsPanel.open) {
      driveStatusElement.textContent =
        "操縦命令を受信しました。\n" +
        "X：" +
        commandX +
        "\n" +
        "Y：" +
        commandY +
        "\n" +
        "sequence：" +
        command.sequence;
    }

    if (!isStopCommand) {
      /*
        新しい移動命令が届いたため、
        古い停止座標の予約再送を中止する。
      */
      cancelRemoteStopResend();

      sendCoordinatesToBle(
        commandX,
        commandY
      );

      return;
    }

    /*
      停止座標をBLEへ確実に送る。
    */
    sendStopToBleWithRetry();

    return;
  }

  console.log(
    "未対応のDataChannelメッセージを受信しました。",
    command
  );
}
