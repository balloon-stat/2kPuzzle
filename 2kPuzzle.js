class Game {
	static SIZE = 4;
	static CELL_COUNT = 16;
  static CELL_GAP = 10;
  static BOARD_PADDING = 10;
  static TILE_COLORS = {
			2: "#eee4da",
			4: "#ede0c8",
			8: "#f2b179",
			16: "#f59563",
			32: "#f67c5f",
			64: "#f65e3b",
			128: "#edcf72",
			256: "#edcc61",
			512: "#edc850",
			1024: "#edc53f",
			2048: "#edc22e",
	};

	constructor() {
		this.boardElement = document.getElementById("board");
		this.tileLayer = document.getElementById("tileLayer");
		this.messageElement = document.getElementById("message");
		this.scoreElement = document.getElementById("score");
		this.bestElement = document.getElementById("bestScore");
		this.sound = new Sound();

		this.board = new Array(Game.CELL_COUNT).fill(null);
		this.tileElements = new Map();
		this.moveRecords = [];
		this.undoState = null;

		this.setupInput();

		this.nextTileId = 1;
		this.score = 0;
		this.bestScore = 0;
		this.animating = false;
		this.cellSize = 0; // calculateLayout()で決定する

		this.createBackgroundCells();
		this.calculateLayout();

		window.addEventListener("resize", () => {
			this.calculateLayout();
			this.syncTilesToBoard();
		});

		document.getElementById("newButton").addEventListener("click", () => {
      this.startNewGame();
      this.saveGame();
		});
		document
			.getElementById("undoButton")
			.addEventListener("click", () => this.undo());
	}

	undo() {
		if (!this.undoState) { return; }
		if (this.gameOver) { this.hideMessage(); }
    this.restoreSnapshot(this.undoState);
		this.updateScore();

		this.tileLayer.innerHTML = "";
		this.tileElements.clear();
		this.syncTilesToBoard();
		this.saveGame();
	}

  createSnapshot() {
    return {
      board: structuredClone(this.board),
      nextTileId: this.nextTileId,
      score: this.score,
      cleared: this.cleared,
      gameOver: this.gameOver,
    };
  } 

  restoreSnapshot(snapshot) {
    this.board = structuredClone(snapshot.board);
    this.nextTileId = snapshot.nextTileId;
    this.score = snapshot.score;
    this.cleared = snapshot.cleared;
    this.gameOver = snapshot.gameOver;
  }

	setupInput() {
		const board = this.boardElement;
		let startX = 0;
		let startY = 0;
		let activePointerId = null;

		board.addEventListener("pointerdown", (e) => {
			board.setPointerCapture(e.pointerId);
			activePointerId = e.pointerId;

			startX = e.clientX;
			startY = e.clientY;
		});

		board.addEventListener("pointerup", (e) => {
			if (activePointerId !== e.pointerId) {
				return;
			}
			activePointerId = null;
			board.releasePointerCapture(e.pointerId);

			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
				return;
			}

			if (Math.abs(dx) > Math.abs(dy)) {
				this.move(dx > 0 ? "right" : "left");
			} else {
				this.move(dy > 0 ? "down" : "up");
			}
		});

		board.addEventListener("pointercancel", (e) => {
			if (board.hasPointerCapture(e.pointerId)) {
				board.releasePointerCapture(e.pointerId);
			}
			activePointerId = null;
			startX = 0;
			startY = 0;
		});
	}

	createBackgroundCells() {
		const layer = document.querySelector(".cell-layer");

		for (let i = 0; i < Game.CELL_COUNT; i++) {
			const cell = document.createElement("div");

			cell.className = "cell";
			layer.appendChild(cell);
		}
	}

	calculateLayout() {
		const pad = Game.BOARD_PADDING;
		const gap = Game.CELL_GAP;
		const size = Game.SIZE;
		const width = this.boardElement.clientWidth;

		this.cellSize = (width - pad * 2 - gap * (size - 1)) / size;
	}

	indexToPosition(index) {
		const pad = Game.BOARD_PADDING;
		const gap = Game.CELL_GAP;
		const size = Game.SIZE;
		const row = Math.floor(index / size);
		const col = index % size;

		return {
			left: pad + col * (this.cellSize + gap),
			top: pad + row * (this.cellSize + gap),
		};
	}

	createTile(boardValue) {
		const tile = document.createElement("div");

		tile.className = "tile";
		tile.dataset.id = boardValue.id;
		this.tileLayer.appendChild(tile);
		this.tileElements.set(boardValue.id, tile);

		return tile;
	}

	setTileDOM(id, index) {
		const element = this.tileElements.get(id);
		if (!element) {
			return;
		}
		const pos = this.indexToPosition(index);

		element.style.transition = "none";

		element.style.left = `${pos.left}px`;
		element.style.top = `${pos.top}px`;

		element.offsetHeight;
		element.style.transition = "";
	}

	moveTileDOM(id, index) {
		const element = this.tileElements.get(id);
		if (!element) {
			return;
		}
		const pos = this.indexToPosition(index);

		element.style.left = `${pos.left}px`;
		element.style.top = `${pos.top}px`;
	}

	updateTileAppearance(id, value) {
		const el = this.tileElements.get(id);

		el.style.width = `${this.cellSize}px`;
		el.style.height = `${this.cellSize}px`;
		el.style.fontSize = `${Math.max(20, 40 - String(value).length * 4)}px`;
		el.textContent = value;

		el.style.background = Game.TILE_COLORS[value] || "#3c3a32";
		el.style.color = value >= 8 ? "#fff" : "#776e65";
	}

	compressLine(cells) {
		const result = [];
		const moves = [];
		let scoreGain = 0;

		for (const current of cells) {
			if (!current) {
				continue;
			}
			const last = result[result.length - 1];

			if (last && !last.merged && last.value === current.value) {
				const targetPos = result.length - 1;
				const newValue = last.value * 2;

				last.value = newValue;
				last.merged = true;
				scoreGain += newValue;

				// 残る側
				moves.push({
					id: last.id,
					from: last.source,
					to: targetPos,
					merged: true,
					removed: false,
					newValue,
				});
				// 消える側
				moves.push({
					id: current.id,
					from: current.source,
					to: targetPos,
					merged: true,
					removed: true,
					newValue,
				});
			} else {
				result.push({
					id: current.id,
					value: current.value,
					source: current.source,
					merged: false,
				});
			}
		}
		result.forEach((cell, to) => {
			const alreadyMerged = moves.some((m) => m.id === cell.id);
			if (!alreadyMerged) {
				moves.push({
					id: cell.id,
					from: cell.source,
					to,
					merged: false,
					removed: false,
					newValue: cell.value,
				});
			}
		});
		const boardLine = result.map((cell) => ({
			id: cell.id,
			value: cell.value,
		}));

		while (boardLine.length < Game.SIZE) {
			boardLine.push(null);
		}

		return {
			line: boardLine,
			scoreGain,
			moves,
		};
	}

	rowColToIndex(row, col) {
		return row * Game.SIZE + col;
	}

	getRow(row) {
    const sz = Game.SIZE;
		return [
			this.board[row * sz],
			this.board[row * sz + 1],
			this.board[row * sz + 2],
			this.board[row * sz + 3],
		];
	}

	setRow(row, data) {
		for (let col = 0; col < Game.SIZE; col++) {
			this.board[this.rowColToIndex(row, col)] = data[col];
		}
	}

	getColumn(col) {
    const sz = Game.SIZE;
		return [
			this.board[col],
			this.board[col + sz],
			this.board[col + sz * 2],
			this.board[col + sz * 3],
		];
	}

	setColumn(col, data) {
		for (let row = 0; row < Game.SIZE; row++) {
			this.board[this.rowColToIndex(row, col)] = data[row];
		}
	}

	startNewGame() {
		this.board.fill(null);
		this.tileElements.clear();
		this.tileLayer.innerHTML = "";
		this.moveRecords = [];
		this.undoState = null;
		this.cleared = false;
		this.gameOver = false;
		this.nextTileId = 1;
		this.score = 0;

		this.hideMessage();

		this.updateScore();
		this.spawnValue();
		this.spawnValue();
		this.syncTilesToBoard();
	}

	getEmptyCells() {
		const result = [];
		for (let i = 0; i < Game.CELL_COUNT; i++) {
			if (this.board[i] === null) {
				result.push(i);
			}
		}

		return result;
	}

	spawnValue() {
		const empty = this.getEmptyCells();
		if (empty.length === 0) {
			return false;
		}

		const index = empty[Math.floor(Math.random() * empty.length)];
		this.board[index] = {
			id: this.nextTileId++,
			value: Math.random() < 0.9 ? 2 : 4,
		};
		return true;
	}

	updateScore() {
		this.scoreElement.textContent = this.score;
		this.bestScore = Math.max(this.bestScore, this.score);
		this.bestElement.textContent = this.bestScore;
	}

	moveLeft() {
		let changed = false;
		let totalScore = 0;

		for (let row = 0; row < Game.SIZE; row++) {
			const line = this.getRow(row);
			const cells = line.map((_val, col) => {
				const index = this.rowColToIndex(row, col);
				const tile = this.board[index];
				return tile
					? {
							...tile,
							source: index,
						}
					: null;
			});
			const result = this.compressLine(cells);
			if (JSON.stringify(line) !== JSON.stringify(result.line)) {
				changed = true;
			}

			totalScore += result.scoreGain;
			this.setRow(row, result.line);
			for (const move of result.moves) {
				this.moveRecords.push({
					...move,
					to: this.rowColToIndex(row, move.to),
				});
			}
		}
		return { changed, scoreGain: totalScore };
	}

	moveRight() {
		let changed = false;
		let totalScore = 0;

		for (let row = 0; row < Game.SIZE; row++) {
			const line = this.getRow(row);
			const cells = [...line].reverse().map((_val, col) => {
				const index = this.rowColToIndex(row, 3 - col);
				const tile = this.board[index];
				return tile
					? {
							...tile,
							source: index,
						}
					: null;
			});
			const result = this.compressLine(cells);
			const output = [...result.line].reverse();
			if (JSON.stringify(this.getRow(row)) !== JSON.stringify(output)) {
				changed = true;
			}

			totalScore += result.scoreGain;
			this.setRow(row, output);
			for (const move of result.moves) {
				this.moveRecords.push({
					...move,
					to: this.rowColToIndex(row, 3 - move.to),
				});
			}
		}
		return { changed, scoreGain: totalScore };
	}

	moveUp() {
		let changed = false;
		let totalScore = 0;

		for (let col = 0; col < Game.SIZE; col++) {
			const line = this.getColumn(col);
			const cells = line.map((_val, row) => {
				const index = this.rowColToIndex(row, col);
				const tile = this.board[index];
				return tile
					? {
							...tile,
							source: index,
						}
					: null;
			});
			const result = this.compressLine(cells);

			if (JSON.stringify(line) !== JSON.stringify(result.line)) {
				changed = true;
			}

			totalScore += result.scoreGain;
			this.setColumn(col, result.line);

			for (const move of result.moves) {
				this.moveRecords.push({
					...move,
					to: this.rowColToIndex(move.to, col),
				});
			}
		}

		return { changed, scoreGain: totalScore };
	}

	moveDown() {
		let changed = false;
		let totalScore = 0;

		for (let col = 0; col < Game.SIZE; col++) {
			const line = this.getColumn(col);
			const cells = [...line].reverse().map((_val, row) => {
				const index = this.rowColToIndex(3 - row, col);
				const tile = this.board[index];
				return tile
					? {
							...tile,
							source: index,
						}
					: null;
			});
			const result = this.compressLine(cells);
			const output = [...result.line].reverse();

			if (JSON.stringify(this.getColumn(col)) !== JSON.stringify(output)) {
				changed = true;
			}

			totalScore += result.scoreGain;
			this.setColumn(col, output);

			for (const move of result.moves) {
				this.moveRecords.push({
					...move,
					to: this.rowColToIndex(3 - move.to, col),
				});
			}
		}
		return { changed, scoreGain: totalScore };
	}

	async move(direction) {
		if (this.animating) { return; }
		if (this.gameOver) { return; }

    const beforeState = this.createSnapshot();
		this.moveRecords = [];

		let result;
		switch (direction) {
			case "left":
				result = this.moveLeft();
				break;
			case "right":
				result = this.moveRight();
				break;
			case "up":
				result = this.moveUp();
				break;
			case "down":
				result = this.moveDown();
				break;
			default:
				console.error(`move at not direction: ${direction}`);
				return;
		}

		if (!result.changed) {
			return;
		}
		this.undoState = beforeState;
		this.animating = true;
		this.score += result.scoreGain;
		this.updateScore();

    this.sound.move();
		this.animateMoves();
		await this.sleep(140);
		if (result.scoreGain > 0) {

      const maxMergedValue = Math.max(
        ...this.moveRecords
          .filter((m) => m.merged)
          .map((m) => m.newValue)
      );

      this.sound.merge(maxMergedValue);
      navigator.vibrate?.(10);
		}
		this.applyMoveResult();
		await this.sleep(40);
		this.animateMergedTiles();
		await this.sleep(140);
		this.spawnValue();
		this.syncTilesToBoard(true);
		this.checkClear();
		this.checkGameOver();
		this.saveGame();
		this.animating = false;
		this.moveRecords = [];
	}

	saveGame() {
		const data = {
			board: this.board,
			nextTileId: this.nextTileId,
			score: this.score,
			bestScore: this.bestScore,
			undoState: this.undoState,
			cleared: this.cleared,
			gameOver: this.gameOver,
		};
		localStorage.setItem("2kPuzzle", JSON.stringify(data));
	}

	loadGame() {
		const raw = localStorage.getItem("2kPuzzle");
		if (!raw) {
			this.startNewGame();
			return;
		}
		const data = JSON.parse(raw);

		this.tileElements.clear();
		this.tileLayer.innerHTML = "";
		this.moveRecords = [];

		this.board = data.board;
		this.nextTileId = data.nextTileId;
		this.score = data.score || 0;
		this.bestScore = data.bestScore || 0;
		this.undoState = data.undoState || null;
		this.cleared = data.cleared || false;
		this.gameOver = data.gameOver || false;
		this.updateScore();
		this.syncTilesToBoard();
		if (this.gameOver) {
			this.showMessage("GAME OVER");
		}
	}

	animateMoves() {
		for (const move of this.moveRecords) {
			const element = this.tileElements.get(move.id);
			if (!element) {
				continue;
			}
			this.moveTileDOM(move.id, move.to);
		}
	}

	animateMergedTiles() {
		for (const move of this.moveRecords) {
			const element = this.tileElements.get(move.id);
			if (!element) {
				continue;
			}
			if (move.merged && !move.removed) {
				element.classList.add("tile-pop");

				element.addEventListener(
					"animationend",
					() => element.classList.remove("tile-pop"),
					{ once: true },
				);
			}
		}
	}

	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	applyMoveResult() {
		for (const move of this.moveRecords) {
			if (move.removed) {
				const el = this.tileElements.get(move.id);
				if (el) {
					el.remove();
					this.tileElements.delete(move.id);
				}
			} else if (move.merged) {
				this.updateTileAppearance(move.id, move.newValue);
			}
		}
	}

	syncTilesToBoard(animateNew = false) {
		for (let index = 0; index < Game.CELL_COUNT; index++) {
			const tile = this.board[index];
			if (!tile) {
				continue;
			}

			// 新規生成タイル
			if (!this.tileElements.has(tile.id)) {
				const element = this.createTile(tile);
				if (animateNew) {
					element.classList.add("tile-new");
					element.addEventListener(
						"animationend",
						() => element.classList.remove("tile-new"),
						{ once: true },
					);
				}
			}
			this.updateTileAppearance(tile.id, tile.value);
			this.setTileDOM(tile.id, index);
		}
	}

	showMessage(text) {
		this.messageElement.textContent = text;
		this.messageElement.classList.remove("message-hidden");
		this.messageElement.classList.add("message-show");
	}

	hideMessage() {
		this.messageElement.classList.remove("message-show");
		this.messageElement.classList.add("message-hidden");
	}

	checkClear() {
		if (this.cleared) {
			return;
		}

		for (const tile of this.board) {
			if (tile && tile.value === 2048) {
				this.cleared = true;
				this.showMessage("2048!");

				this.sound.clear();
				navigator.vibrate?.([100, 50, 100]);
				setTimeout(() => this.hideMessage(), 1500);
				break;
			}
		}
	}

	canMove() {
		for (let i = 0; i < Game.CELL_COUNT; i++) {
			if (this.board[i] === null) {
				return true;
			}
		}
		for (let r = 0; r < Game.SIZE; r++) {
			for (let c = 0; c < Game.SIZE; c++) {
				const idx = r * Game.SIZE + c;
				const tile = this.board[idx];
				if (c < 3) {
					const right = this.board[idx + 1];
					if (tile && right && tile.value === right.value) {
						return true;
					}
				}

				if (r < 3) {
					const down = this.board[idx + Game.SIZE];
					if (tile && down && tile.value === down.value) {
						return true;
					}
				}
			}
		}
		return false;
	}

	checkGameOver() {
		if (this.canMove()) {
			return;
		}
		this.gameOver = true;
		this.showMessage("GAME OVER");
		this.sound.gameOver();
		navigator.vibrate?.([200, 100, 200]);
	}
}

window.addEventListener("load", () => {
	window.game = new Game();
	game.loadGame();
});

