// BowlingGame — pure game logic, no UI or rendering dependencies.
// All state is plain JS. Call recordRoll() after each throw resolves.

export class BowlingGame {
  constructor() {
    this.players = [];          // [{ id, name, frames }]
    this.currentPlayerIndex = 0;
    this.currentFrame = 0;      // 0–9
    this.currentRoll = 0;       // 0–1 for frames 0–8; 0–2 for frame 9
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  addPlayer(id, name) {
    this.players.push({ id, name, frames: [] });
  }

  // ── Turn info ───────────────────────────────────────────────────────────────

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  isGameOver() {
    if (this.currentFrame < 9) return false;
    return this.players.every((p) => this._isFrame9Complete(p));
  }

  // ── Recording rolls ─────────────────────────────────────────────────────────

  // pins: number of pins knocked down (0–10, but caller ensures valid values).
  // Returns { advancedPlayer: bool, advancedFrame: bool, gameOver: bool }.
  recordRoll(pins) {
    const player = this.getCurrentPlayer();

    // Ensure frame array exists
    if (!player.frames[this.currentFrame]) {
      player.frames[this.currentFrame] = [];
    }
    player.frames[this.currentFrame].push(pins);

    const frameComplete =
      this.currentFrame < 9
        ? this._isNormalFrameComplete(player.frames[this.currentFrame])
        : this._isFrame9Complete(player);

    let advancedPlayer = false;
    let advancedFrame = false;

    if (frameComplete) {
      // Move to next player
      this.currentPlayerIndex++;
      advancedPlayer = true;

      if (this.currentPlayerIndex >= this.players.length) {
        // All players done with this frame
        this.currentPlayerIndex = 0;

        if (this.currentFrame < 9) {
          this.currentFrame++;
          advancedFrame = true;
        }
        // If currentFrame === 9 and all frame 9s are complete, isGameOver() returns true
      }

      this.currentRoll = 0;
    } else {
      this.currentRoll++;
    }

    return {
      advancedPlayer,
      advancedFrame,
      gameOver: this.isGameOver(),
    };
  }

  // Frame 0–8: complete after a strike on roll 0, or after 2 rolls.
  _isNormalFrameComplete(rolls) {
    if (rolls[0] === 10) return true; // strike — explicit check, frame ends immediately
    if (rolls.length >= 2) return true;
    return false;
  }

  // Frame 9 has special rules — up to 3 rolls.
  _isFrame9Complete(player) {
    const rolls = player.frames[9];
    if (!rolls || rolls.length === 0) return false;

    if (rolls[0] === 10) {
      // Strike on roll 0 — need 2 more rolls (rolls 1 and 2)
      return rolls.length >= 3;
    }
    if (rolls.length >= 2 && rolls[0] + rolls[1] === 10) {
      // Spare on rolls 0+1 — need 1 more roll
      return rolls.length >= 3;
    }
    // No strike or spare — done after 2 rolls
    return rolls.length >= 2;
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────

  // Returns array of per-player score rows.
  // Each row: [{ roll1, roll2, roll3?, frameTotal }] for 10 frames.
  // frameTotal is null if bonus rolls haven't been bowled yet.
  getScores() {
    return this.players.map((player) => ({
      id: player.id,
      name: player.name,
      frames: this._computeFrames(player),
    }));
  }

  _computeFrames(player) {
    // Flatten all rolls into a single sequence for lookahead
    const flat = player.frames.flat();
    const frames = [];
    let flatIndex = 0;

    for (let f = 0; f < 10; f++) {
      const rolls = player.frames[f] ?? [];

      if (f < 9) {
        // Normal frame
        const r0 = rolls[0] ?? null;
        const r1 = rolls[1] ?? null;

        let frameTotal = null;
        if (r0 === 10) {
          // Strike — needs next 2 rolls as bonus
          const b1 = flat[flatIndex + 1] ?? null;
          const b2 = flat[flatIndex + 2] ?? null;
          if (b1 !== null && b2 !== null) {
            frameTotal = 10 + b1 + b2;
          }
          flatIndex += 1;
        } else if (r0 !== null && r1 !== null && r0 + r1 === 10) {
          // Spare — needs next 1 roll as bonus
          const b1 = flat[flatIndex + 2] ?? null;
          if (b1 !== null) {
            frameTotal = 10 + b1;
          }
          flatIndex += 2;
        } else if (r0 !== null && r1 !== null) {
          // Open frame
          frameTotal = r0 + r1;
          flatIndex += 2;
        } else if (r0 !== null) {
          // Frame in progress
          flatIndex += 1;
        }

        frames.push({ rolls, frameTotal });
      } else {
        // 10th frame — no bonus lookahead, score is just sum of up to 3 rolls
        const complete = this._isFrame9Complete(player);
        const frameTotal = complete ? rolls.reduce((a, b) => a + b, 0) : null;
        frames.push({ rolls, frameTotal });
      }
    }

    // Compute running totals — null if any prior frame is unresolved
    let running = 0;
    return frames.map((f) => {
      if (f.frameTotal === null || running === null) {
        running = null;
        return { ...f, runningTotal: null };
      }
      running += f.frameTotal;
      return { ...f, runningTotal: running };
    });
  }

  // Pins remaining on the lane this frame (used to validate second roll input).
  pinsRemainingThisFrame() {
    const player = this.getCurrentPlayer();
    const rolls = player.frames[this.currentFrame] ?? [];
    if (this.currentFrame === 9) {
      // After a strike in 10th, fresh set of 10
      if (rolls.length === 1 && rolls[0] === 10) return 10;
      if (rolls.length === 2 && rolls[0] === 10) return 10;
      if (rolls.length === 2 && rolls[0] + rolls[1] === 10) return 10;
      return 10 - (rolls[rolls.length - 1] ?? 0);
    }
    if (rolls.length === 0) return 10;
    return 10 - rolls[0];
  }
}
