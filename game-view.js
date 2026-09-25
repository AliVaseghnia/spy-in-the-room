(function (root, factory) {
  'use strict';

  var view = factory();

  if (typeof module === 'object' && module.exports) module.exports = view;
  if (root) root.SpyGameView = view;
}(typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIMER_RING_CIRCUMFERENCE = 326.73;

  function clearList(list) {
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function createElement(ctx, tag, className, text) {
    var element = ctx.documentRef.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function createAvatar(ctx, index, large) {
    var avatar = ctx.avatarFor(index);
    var element = createElement(ctx, 'span', 'avatar' + (large ? ' avatar-large' : ''));
    element.textContent = avatar.emoji;
    element.style.setProperty('--avatar-color', avatar.color);
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  function createPlayerButton(ctx, player, index, action) {
    var button = createElement(ctx, 'button', 'choice-button');
    var state = ctx.state;
    var label = createElement(ctx, 'span', 'choice-label', player.displayName);

    button.type = 'button';
    button.appendChild(createAvatar(ctx, index));
    button.appendChild(label);
    button.setAttribute('data-choice-action', action);
    button.setAttribute('data-choice-value', player.id);
    button.setAttribute('aria-label', action === 'accuse'
      ? 'Choose ' + player.displayName + ' as the suspect'
      : 'Let ' + player.displayName + ' call for a guess');
    if (action === 'accuse') {
      button.setAttribute('aria-pressed', String(player.id === state.pendingAccusationPlayerId));
    }
    button.disabled = state.mutationBusy;
    return button;
  }

  function renderSetup(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var roster = Array.isArray(state.roster) ? state.roster : [];

    clearList(refs.playerChips);
    roster.forEach(function (name, index) {
      var item = createElement(ctx, 'li', 'player-chip');
      var removeButton = createElement(ctx, 'button', 'player-chip-remove', '×');

      removeButton.type = 'button';
      removeButton.setAttribute('data-remove-player', String(index));
      removeButton.setAttribute('aria-label', 'Remove ' + name);
      item.appendChild(createAvatar(ctx, index));
      item.appendChild(createElement(ctx, 'span', 'player-chip-name', name));
      item.appendChild(removeButton);
      refs.playerChips.appendChild(item);
    });

    ctx.updateSetupControls();
  }

  function renderReveal(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var snapshot = state.snapshot;
    var players = snapshot && Array.isArray(snapshot.players) ? snapshot.players : [];
    var revealIndex = snapshot ? Number(snapshot.revealIndex) || 0 : 0;
    var player = snapshot && snapshot.currentPlayer ? snapshot.currentPlayer : players[revealIndex];
    var nextPlayer = players[revealIndex + 1] || null;
    var card = state.visibleCard;
    var cardPlayerId = card && card.player && card.player.id;
    var customMode = snapshot && snapshot.secretMode === 'custom';
    var isCardVisible = Boolean(player && card && cardPlayerId === player.id);
    var isHandoffComplete = Boolean(state.cardHidden && !isCardVisible);
    var currentStep = isCardVisible ? 'reveal' : isHandoffComplete ? 'pass' : 'handoff';

    if (!player) return;

    if (refs.revealTitle) {
      refs.revealTitle.textContent = isCardVisible
        ? player.displayName + '’s private card'
        : isHandoffComplete
          ? nextPlayer ? 'Pass the phone to ' + nextPlayer.displayName : 'Cards are hidden'
          : 'Pass the phone to ' + player.displayName;
    }
    if (refs.revealInstruction) {
      refs.revealInstruction.textContent = isHandoffComplete
        ? nextPlayer
          ? 'Only ' + nextPlayer.displayName + ' should look at the next card.'
          : 'Everyone can look up when the round starts.'
        : 'Only ' + player.displayName + ' should look at this card.';
    }
    if (refs.revealProgress) {
      refs.revealProgress.textContent = 'Card ' + Math.min(revealIndex + 1, players.length || 1) + ' of ' + (players.length || 1);
    }
    if (refs.revealSteps) {
      Array.prototype.forEach.call(refs.revealSteps, function (step) {
        var isCurrent = step.getAttribute('data-reveal-step') === currentStep;
        step.classList.toggle('is-current', isCurrent);
        if (isCurrent) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
    }

    refs.revealCard.removeAttribute('data-revealed');
    if (isCardVisible) refs.revealCard.setAttribute('data-revealed', 'true');
    if (refs.revealCardFace) refs.revealCardFace.removeAttribute('data-role');
    refs.revealAction.dataset.revealing = String(Boolean(state.revealPending));
    refs.revealAction.disabled = Boolean(state.mutationBusy || state.revealPending);
    if (refs.revealAgain) {
      refs.revealAgain.hidden = !isHandoffComplete;
      refs.revealAgain.disabled = Boolean(state.mutationBusy || state.revealPending);
    }

    if (state.privacyLocked) {
      if (refs.privacyCover) refs.privacyCover.hidden = false;
      if (refs.revealActionLabel) refs.revealActionLabel.textContent = 'Reveal card';
      refs.revealAction.removeAttribute('data-revealed');
      refs.revealAction.removeAttribute('aria-pressed');
      refs.revealAction.setAttribute('aria-label', 'Reveal ' + player.displayName + '’s card');
      if (refs.revealNote) refs.revealNote.textContent = 'The screen was cleared. Make sure only ' + player.displayName + ' is looking, then reveal the card.';
      return;
    }

    if (refs.privacyCover) refs.privacyCover.hidden = true;
    refs.revealSecret.removeAttribute('data-role');

    if (!isCardVisible) {
      refs.revealLabel.textContent = isHandoffComplete ? 'Card hidden' : state.revealPending ? 'Preparing your card' : 'Private card';
      refs.revealSecret.textContent = isHandoffComplete
        ? nextPlayer ? 'Pass the phone to ' + nextPlayer.displayName + '.' : 'The reveal is complete.'
        : state.revealPending ? 'Loading your card…' : 'Reveal your card when ready.';
      refs.revealHint.textContent = isHandoffComplete
        ? nextPlayer
          ? nextPlayer.displayName + ' can continue when they have the phone.'
          : 'Start the round when everyone is ready.'
        : 'Only ' + player.displayName + ' should see this.';
      if (refs.revealArt) {
        refs.revealArt.src = 'assets/pass-phone.png';
        refs.revealArt.alt = '';
      }
      if (refs.revealActionLabel) refs.revealActionLabel.textContent = state.revealPending
        ? 'Loading card…'
        : isHandoffComplete
          ? nextPlayer ? 'Pass to ' + nextPlayer.displayName : 'Start the round'
          : 'I’m ' + player.displayName + ' — reveal card';
      refs.revealAction.setAttribute('aria-label', state.revealPending
        ? 'Loading ' + player.displayName + '’s card'
        : isHandoffComplete
          ? nextPlayer ? 'Pass the phone to ' + nextPlayer.displayName : 'Start the round'
          : 'Reveal ' + player.displayName + '’s card');
      refs.revealAction.removeAttribute('aria-pressed');
      if (refs.revealNote) refs.revealNote.textContent = isHandoffComplete
        ? nextPlayer
          ? 'Card hidden. Hand the phone to ' + nextPlayer.displayName + ' before continuing.'
          : 'All cards are hidden. Start the round when everyone is ready.'
        : state.revealPending
          ? 'Your private card is loading.'
          : 'Pass the phone to ' + player.displayName + ' before revealing.';
      return;
    }

    refs.revealLabel.textContent = card.isSpy ? 'Your role' : 'Your assignment';
    if (refs.revealCardFace) refs.revealCardFace.setAttribute('data-role', card.isSpy ? 'spy' : 'agent');
    if (refs.revealArt) {
      refs.revealArt.src = card.isSpy ? 'assets/role-spy.png' : 'assets/role-agent.png';
      refs.revealArt.alt = '';
    }
    refs.revealSecret.textContent = card.isSpy
      ? 'You’re the spy.'
      : (customMode ? 'Secret: ' : 'Location: ') + card.location;
    refs.revealSecret.setAttribute('data-role', card.isSpy ? 'spy' : 'agent');
    refs.revealHint.textContent = card.isSpy
      ? (card.partner
        ? 'You’re working with ' + card.partner.displayName + '. Keep it private, then hide the card.'
        : 'Keep it private, then hide the card.')
      : (customMode
        ? 'Keep it secret, then hide the card.'
        : 'Category: ' + card.category + '. Hide the card before passing the phone.');
    if (refs.revealActionLabel) refs.revealActionLabel.textContent = 'Hide card';
    refs.revealAction.setAttribute('aria-label', 'Hide ' + player.displayName + '’s card');
    refs.revealAction.removeAttribute('aria-pressed');
    if (refs.revealNote) refs.revealNote.textContent = 'Read the card, then hide it before passing the phone.';
  }

  function renderRound(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var snapshot = state.snapshot || {};
    var players = Array.isArray(snapshot.players) ? snapshot.players : [];
    var customMode = snapshot.secretMode === 'custom';
    var question = state.question || null;

    refs.roundTitle.textContent = 'Ask your questions';
    refs.roundLocationHint.textContent = customMode
      ? 'Everyone else knows the secret. The spy doesn’t.'
      : 'Everyone else knows the location. The spy doesn’t.';

    clearList(refs.guessCallerList);
    players.forEach(function (player, index) {
      var item = createElement(ctx, 'li');
      item.appendChild(createPlayerButton(ctx, player, index, 'call-guess'));
      refs.guessCallerList.appendChild(item);
    });

    refs.guessCallPanel.hidden = !state.showGuessCallPanel;
    refs.callGuessButton.textContent = state.showGuessCallPanel
      ? 'Close guess call'
      : 'Spy: I have the secret';

    if (refs.roundIntel) {
      var spyCount = ctx.logic.getSpyCount(players.length || 4);
      refs.roundIntel.textContent = (spyCount === 1 ? '1 spy' : spyCount + ' spies')
        + ' among ' + players.length + ' · Round ' + (snapshot.roundNumber || 1) + ' of ' + (snapshot.roundsTotal || 5);
    }

    if (refs.twistStrip && refs.twistText) {
      var twist = state.twist || '';
      refs.twistStrip.hidden = !twist;
      refs.twistText.textContent = twist;
    }

    if (refs.questionPrompt) {
      refs.questionPrompt.textContent = question && question.text
        ? question.text
        : 'Ask one question around the room.';
    }

    ctx.renderTimer();
  }

  function renderAccuse(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var players = state.snapshot && Array.isArray(state.snapshot.players) ? state.snapshot.players : [];
    var selectedPlayer = players.find(function (player) {
      return player.id === state.pendingAccusationPlayerId;
    });

    clearList(refs.suspectList);
    players.forEach(function (player, index) {
      var item = createElement(ctx, 'li');
      item.appendChild(createPlayerButton(ctx, player, index, 'accuse'));
      refs.suspectList.appendChild(item);
    });

    refs.accusationConfirmation.hidden = !selectedPlayer;
    if (selectedPlayer) {
      refs.accusationConfirmationCopy.textContent = 'The room agrees: ' + selectedPlayer.displayName
        + ' is the spy. No changing it after this — pick wrong and the spies take the round.';
      refs.accusationDialog.hidden = false;
      if (typeof refs.accusationDialog.showModal === 'function' && !refs.accusationDialog.open) {
        refs.accusationDialog.showModal();
      }
    } else {
      ctx.closeAccusationDialog();
    }
  }

  function renderGuess(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var player = state.snapshot && state.snapshot.guessingPlayer;
    var customMode = state.snapshot && state.snapshot.secretMode === 'custom';
    var filter = String(state.guessFilter || '').trim().toLowerCase();
    var deck = ctx.logic.LOCATION_DECK || [];
    var matches = deck.filter(function (place) {
      return place && place.name && (!filter || place.name.toLowerCase().indexOf(filter) !== -1);
    });

    refs.guessTurnLabel.textContent = player
      ? 'Pass the phone to ' + player.displayName + '. Only they should enter the guess.'
      : 'Pass the phone to the guessing player.';
    refs.guessList.hidden = customMode;
    if (refs.guessSearchField) refs.guessSearchField.hidden = customMode;
    refs.guessCustomForm.hidden = !customMode;

    if (!customMode) {
      clearList(refs.guessList);
      if (matches.length === 0) {
        var empty = createElement(ctx, 'li', 'choice-empty', 'No location matches “' + state.guessFilter + '”. Try another word.');
        refs.guessList.appendChild(empty);
      }
      matches.forEach(function (place) {
        var item = createElement(ctx, 'li');
        var button = createElement(ctx, 'button', 'choice-button', place.name);
        button.type = 'button';
        button.setAttribute('data-choice-action', 'guess');
        button.setAttribute('data-choice-value', place.name);
        button.setAttribute('aria-label', 'Guess ' + place.name);
        button.setAttribute('aria-pressed', String(place.name === state.pendingGuessLocation));
        button.disabled = state.mutationBusy;
        item.appendChild(button);
        refs.guessList.appendChild(item);
      });
    } else if (state.pendingGuessLocation && refs.guessInput) {
      refs.guessInput.value = state.pendingGuessLocation;
    }

    refs.guessDialog.hidden = !state.pendingGuessLocation;
    if (state.pendingGuessLocation) {
      refs.guessConfirmationCopy.textContent = 'The spy will lock in “' + state.pendingGuessLocation + '”. There’s no changing it after this.';
      if (typeof refs.guessDialog.showModal === 'function' && !refs.guessDialog.open) refs.guessDialog.showModal();
    } else {
      ctx.closeGuessDialog();
    }
  }

  function renderHistory(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var items = Array.isArray(state.history) ? state.history : [];

    clearList(refs.historyList);
    if (items.length === 0) {
      refs.historyList.appendChild(createElement(ctx, 'li', 'choice-empty', 'No rounds in the books yet.'));
      return;
    }

    items.forEach(function (round) {
      var item = createElement(ctx, 'li', 'history-item');
      var copy = createElement(ctx, 'div', 'history-item-copy');
      var title = createElement(ctx, 'p', 'history-item-title', 'Round ' + round.roundNumber + ': ' + (round.location || 'Location withheld'));
      var spies = Array.isArray(round.spyPlayers) ? round.spyPlayers : [];
      var meta = createElement(ctx, 'p', 'history-item-meta', spies.length
        ? (spies.length > 1 ? 'Spies: ' : 'Spy: ')
          + spies.map(function (spy) { return spy.displayName || spy; }).join(', ')
        : 'Spy details unavailable');
      var outcome = createElement(ctx, 'span', 'history-item-outcome', round.winner === 'spies' ? 'Spies win' : 'Room wins');

      copy.appendChild(title);
      copy.appendChild(meta);
      item.appendChild(copy);
      item.appendChild(outcome);
      refs.historyList.appendChild(item);
    });
  }

  function renderResult(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var outcome = state.snapshot && state.snapshot.outcome || {};
    var spies = Array.isArray(outcome.spyPlayers) ? outcome.spyPlayers : [];
    var session = outcome.session || {};
    var roundPoints = Array.isArray(outcome.roundPoints) ? outcome.roundPoints : [];
    var leaderboard = Array.isArray(session.leaderboard) ? session.leaderboard : [];
    var players = state.snapshot && Array.isArray(state.snapshot.players) ? state.snapshot.players : [];
    var winner = outcome.winner;
    var customMode = state.snapshot && state.snapshot.secretMode === 'custom';
    var spyTeam = spies.length > 1 ? 'The spies' : 'The spy';
    var maxPoints = leaderboard.reduce(function (max, entry) {
      return Math.max(max, Number(entry.points) || 0);
    }, 0);

    if (winner === 'spies') {
      refs.resultTitle.textContent = 'The spies win';
      refs.resultCopy.textContent = outcome.reason === 'correct-guess'
        ? 'A spy named the secret. The spies get away.'
        : 'Wrong suspect. The spies get away.';
    } else {
      refs.resultTitle.textContent = 'The room wins';
      refs.resultCopy.textContent = outcome.reason === 'wrong-accusation'
        ? 'Wrong suspect—but the round is in the books.'
        : spyTeam + ' missed the secret. The room wins.';
    }

    if (refs.resultStamp) refs.resultStamp.setAttribute('data-outcome', winner === 'spies' ? 'spies' : 'room');
    if (refs.resultStampLabel) refs.resultStampLabel.textContent = winner === 'spies' ? 'Spies win' : 'Room wins';
    if (refs.resultSecretLabel) refs.resultSecretLabel.textContent = customMode ? 'Secret' : 'Location';
    refs.resultLocation.textContent = outcome.location || 'Unknown';

    clearList(refs.resultSpies);
    spies.forEach(function (spy) {
      var index = players.findIndex(function (player) { return player.id === (spy && spy.id); });
      var item = createElement(ctx, 'li');
      item.appendChild(createAvatar(ctx, index < 0 ? 0 : index));
      item.appendChild(createElement(ctx, 'span', null, spy && spy.displayName ? spy.displayName : String(spy)));
      refs.resultSpies.appendChild(item);
    });

    refs.sessionScoreStatus.textContent = session.isFinal
      ? 'Five rounds down. ' + (session.winner && session.winner.length === 1
        ? session.winner[0].displayName + ' wins the session.'
        : 'It’s a tie.')
      : 'Round ' + (session.roundsCompleted || 0) + ' of ' + (session.roundsTotal || 5) + ' is on the board.';
    if (refs.resultProgress) {
      refs.resultProgress.textContent = session.isFinal
        ? 'Final round · game over'
        : 'Round ' + (session.roundsCompleted || 0) + ' of ' + (session.roundsTotal || 5);
    }

    clearList(refs.roundPointsList);
    roundPoints.forEach(function (entry) {
      var index = players.findIndex(function (player) {
        return player.id === (entry.player && entry.player.id);
      });
      var item = createElement(ctx, 'li');
      item.setAttribute('data-points', String(Number(entry.points) || 0));
      item.appendChild(createAvatar(ctx, index < 0 ? 0 : index));
      item.appendChild(createElement(ctx, 'span', null, (entry.player && entry.player.displayName ? entry.player.displayName : 'Player')
        + ': +' + entry.points));
      refs.roundPointsList.appendChild(item);
    });

    clearList(refs.scoreboardList);
    leaderboard.forEach(function (entry) {
      var index = players.findIndex(function (player) {
        return player.id === (entry.player && entry.player.id);
      });
      var points = Number(entry.points) || 0;
      var item = createElement(ctx, 'li');
      var bar = createElement(ctx, 'span', 'leaderboard-bar');
      var fill = createElement(ctx, 'span');

      item.appendChild(createAvatar(ctx, index < 0 ? 0 : index));
      item.appendChild(createElement(ctx, 'span', 'leaderboard-name', entry.player && entry.player.displayName ? entry.player.displayName : 'Player'));
      item.appendChild(createElement(ctx, 'span', 'leaderboard-points', points + ' pts'));
      fill.style.width = (maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0) + '%';
      bar.appendChild(fill);
      item.appendChild(bar);
      refs.scoreboardList.appendChild(item);
    });

    refs.replayButton.textContent = session.isFinal
      ? 'Game over'
      : customMode ? 'Pick the next secret' : 'Next round';
    refs.replayButton.disabled = Boolean(session.isFinal) || state.mutationBusy || state.showReplaySecretForm;
    if (refs.shareResultButton) {
      refs.shareResultButton.textContent = state.shareStatus || 'Share result';
      refs.shareResultButton.disabled = state.mutationBusy;
    }
    refs.replaySecretPanel.hidden = !customMode || !state.showReplaySecretForm || Boolean(session.isFinal);
    if (customMode && state.showReplaySecretForm) {
      refs.replaySecretRound.textContent = String((state.snapshot.roundNumber || 1) + 1);
      refs.replaySecretInput.value = state.pendingReplaySecret || '';
      refs.replaySecretSubmit.disabled = state.mutationBusy;
      refs.replaySecretCancel.disabled = state.mutationBusy;
    }
    renderHistory(ctx);
  }

  function renderResume(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;

    clearList(refs.resumeList);
    if (!state.resumeGames.length) {
      refs.resumeList.appendChild(createElement(ctx, 'li', 'choice-empty', 'Nothing saved yet. Start a game below.'));
      return;
    }

    state.resumeGames.forEach(function (game) {
      var item = createElement(ctx, 'li', 'resume-item');
      var copy = createElement(ctx, 'div', 'resume-item-copy');
      var players = Array.isArray(game.players) ? game.players : [];
      var timerMinutes = Math.max(1, Math.round((Number(game.timerSeconds) || ctx.defaultTimerSeconds) / 60));
      var title = createElement(ctx, 'p', 'resume-item-title', game.phase === 'result'
        ? 'Round complete'
        : 'Round ' + game.roundNumber + ' · ' + (ctx.resumePhaseLabels[game.phase] || 'Not started'));
      var meta = createElement(ctx, 'p', 'resume-item-meta', (game.secretMode === 'custom' ? 'Your secret' : 'Random location')
        + ' · ' + timerMinutes + ' min · ' + players.length + ' players');
      var playersLine = createElement(ctx, 'p', 'resume-item-players');
      var actions = createElement(ctx, 'div', 'resume-item-actions');
      var button = createElement(ctx, 'button', 'button button-primary', 'Resume');
      var deleteButton = createElement(ctx, 'button', 'button button-danger button-small', 'Delete');

      players.forEach(function (player, index) {
        playersLine.appendChild(createAvatar(ctx, index));
      });
      playersLine.appendChild(createElement(ctx, 'span', null, players.map(function (player) {
        return player.displayName;
      }).join(' · ')));

      button.type = 'button';
      button.disabled = state.mutationBusy;
      button.setAttribute('data-resume-game-id', game.gameId);
      deleteButton.type = 'button';
      deleteButton.disabled = state.mutationBusy;
      deleteButton.setAttribute('data-resume-delete-game-id', game.gameId);
      deleteButton.setAttribute('aria-label', 'Delete game for ' + players.map(function (player) {
        return player.displayName;
      }).join(', '));

      copy.appendChild(title);
      copy.appendChild(meta);
      copy.appendChild(playersLine);
      actions.appendChild(button);
      actions.appendChild(deleteButton);
      item.appendChild(copy);
      item.appendChild(actions);
      refs.resumeList.appendChild(item);
    });
  }

  function renderConnection(ctx) {
    var state = ctx.state;
    var refs = ctx.refs;
    var hasError = state.connection === 'error';
    var statusLabels = {
      checking: 'Checking',
      connected: 'Online',
      error: 'Offline'
    };

    refs.connectionError.hidden = !hasError;
    if (refs.connectionStatus) refs.connectionStatus.textContent = statusLabels[state.connection] || 'Checking';
    refs.retryButton.disabled = state.mutationBusy;
    refs.resumeNewGameButton.disabled = state.mutationBusy;
    refs.newGameButton.disabled = state.mutationBusy;
    if (refs.callGuessButton) refs.callGuessButton.disabled = state.mutationBusy;
    if (refs.confirmAccusationButton) refs.confirmAccusationButton.disabled = state.mutationBusy;
    if (refs.cancelAccusationButton) refs.cancelAccusationButton.disabled = state.mutationBusy;
    if (refs.confirmGuessButton) refs.confirmGuessButton.disabled = state.mutationBusy;
    if (refs.cancelGuessButton) refs.cancelGuessButton.disabled = state.mutationBusy;
    if (refs.guessInput) refs.guessInput.disabled = state.mutationBusy;
    if (refs.guessSearchInput) refs.guessSearchInput.disabled = state.mutationBusy;
    if (refs.revealAction) refs.revealAction.disabled = state.mutationBusy || state.revealPending;
    if (refs.revealAgain) refs.revealAgain.disabled = state.mutationBusy || state.revealPending;
    if (refs.endRoundButton) refs.endRoundButton.disabled = state.mutationBusy;
    if (refs.confirmEndRoundButton) refs.confirmEndRoundButton.disabled = state.mutationBusy;
    if (refs.cancelEndRoundButton) refs.cancelEndRoundButton.disabled = state.mutationBusy;
    if (refs.replaySecretSubmit) refs.replaySecretSubmit.disabled = state.mutationBusy;
    if (refs.replaySecretCancel) refs.replaySecretCancel.disabled = state.mutationBusy;
    if (refs.confirmResumeDeleteButton) refs.confirmResumeDeleteButton.disabled = state.mutationBusy;
    if (refs.cancelResumeDeleteButton) refs.cancelResumeDeleteButton.disabled = state.mutationBusy;
    if (refs.drawQuestionButton) refs.drawQuestionButton.disabled = state.mutationBusy;
    if (hasError) refs.retryButton.hidden = typeof state.retryOperation !== 'function';
  }

  return {
    renderSetup: renderSetup,
    renderReveal: renderReveal,
    renderRound: renderRound,
    renderAccuse: renderAccuse,
    renderGuess: renderGuess,
    renderResult: renderResult,
    renderResume: renderResume,
    renderConnection: renderConnection
  };
}));
