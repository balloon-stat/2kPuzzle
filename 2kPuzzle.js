class Game {

  static SIZE = 4;
  static CELL_COUNT = 16;

  constructor() {
    this.boardElement = document.getElementById("board");
    this.tileLayer = document.getElementById("tileLayer");
    this.messageElement = document.getElementById("message");
    this.scoreElement = document.getElementById("score");
    this.bestElement = document.getElementById("bestScore");
    this.sound = new Sound();

    this.board = new Array(Game.CELL_COUNT).fill(0);
    this.tiles = new Map();

    this.startX = 0;
    this.startY = 0;

    this.setupInput();

    this.nextTileId = 1;
    this.score = 0;
    this.bestScore = 0;

    this.animating = false;

    this.cellSize = 0;
    this.cellGap = 10;

    this.createBackgroundCells();
    this.calculateLayout();

    window.addEventListener(
      "resize",
      () => this.calculateLayout()
    );
  }

  setupInput(){
    const board = this.boardElement;
    board.addEventListener( "touchstart", e => {
        const t = e.touches[0];

        this.startX = t.clientX;
        this.startY = t.clientY;
      },
      { passive:false }
    );

    board.addEventListener( "touchmove",
      e => e.preventDefault(),
      { passive:false }
    );

    board.addEventListener( "touchend", e => {
      const t = e.changedTouches[0];
      const dx = t.clientX - this.startX;
      const dy = t.clientY - this.startY;

      if( Math.abs(dx) < 30 && Math.abs(dy) < 30){
        return;
      }

      if( Math.abs(dx) > Math.abs(dy)){
        this.move( dx > 0 ? "right" : "left");
      }else{
        this.move( dy > 0 ? "down" : "up");
      }
    });
  }

  createBackgroundCells() {
    const layer = document.querySelector(".cell-layer");

    for(let i=0;i<16;i++){
      const cell = document.createElement("div");

      cell.className = "cell";
      layer.appendChild(cell);
    }
  }

  calculateLayout() {
    const width = this.boardElement.clientWidth;
    this.cellSize = (width - 50) / 4;
  }

  indexToPosition(index){
    const row = Math.floor(index / 4);
    const col = index % 4;

    return {
      left: 10 + col * (this.cellSize + this.cellGap),
      top: 10 + row * (this.cellSize + this.cellGap)
    };
  }

  createTileModel(value,index){
    const id = this.createTile(value,index);
    return { id, value, index };
  }

  createTile(value,index){
    const tile = document.createElement("div");
    const id = this.nextTileId++;

    tile.className = "tile";
    tile.dataset.id = id;
    tile.textContent = value;
    this.tileLayer.appendChild(tile);

    this.tiles.set( id, { id, value, index, element:tile });

    this.updateTileAppearance(id);
    this.moveTileDOM(id,index,false);

    return id;
  }

  moveTileDOM(id,index,animate=true){
    const tile = this.tiles.get(id);
    const pos = this.indexToPosition(index);

    tile.index = index;
    if(!animate){
      tile.element.style.transition = "none";
    }

    tile.element.style.left = pos.left + "px";
    tile.element.style.top = pos.top + "px";
    tile.element.offsetHeight;
    tile.element.style.transition = "";
  }

  updateTileAppearance(id){
    const tile = this.tiles.get(id);
    const el = tile.element;

    el.style.width = this.cellSize + "px";
    el.style.height = this.cellSize + "px";
    el.style.fontSize = Math.max( 20, 40 - String(tile.value).length * 4) + "px";
    el.textContent = tile.value;

    const colors = {
      2:"#eee4da",
      4:"#ede0c8",
      8:"#f2b179",
      16:"#f59563",
      32:"#f67c5f",
      64:"#f65e3b",
      128:"#edcf72",
      256:"#edcc61",
      512:"#edc850",
      1024:"#edc53f",
      2048:"#edc22e"
    };

    el.style.background = colors[tile.value] || "#3c3a32";
    el.style.color = tile.value >= 8 ? "#fff" : "#776e65";
  }

  compressLine(values) {
    const result = [];
    let scoreGain = 0;
    let merged = false;

    for (let i = 0; i < values.length; i++) {
      const current = values[i];
      if (current === 0) {
        continue;
      }

      const last = result[result.length - 1];

      if (
        last &&
        !last.merged &&
        last.value === current
      ) {
        last.value *= 2;
        last.merged = true;
        scoreGain += last.value;
        merged = true;
      } else {
        result.push({
          value: current,
          merged: false
        });
      }
    }

    while (result.length < 4) {
      result.push({
        value: 0,
        merged: false
      });
    }

    return {
      values: result.map(v => v.value),
      scoreGain,
      merged
    };
  }

  rowColToIndex(row,col){
    return row * 4 + col;
  }

  getRow(row){
    return [
      this.board[row * 4],
      this.board[row * 4 + 1],
      this.board[row * 4 + 2],
      this.board[row * 4 + 3]
    ];
  }

  setRow(row,data){
    for(let col=0;col<4;col++){
      this.board[
        this.rowColToIndex(row,col)
      ] = data[col];
    }
  }

  getColumn(col){
    return [
      this.board[col],
      this.board[col + 4],
      this.board[col + 8],
      this.board[col + 12]
    ];
  }

  setColumn(col,data){
    for(let row=0;row<4;row++){
      this.board[ this.rowColToIndex(row,col) ] = data[row];
    }
  }

  startNewGame(){
    this.board.fill(0);
    this.tiles.clear();
    this.tileLayer.innerHTML = "";
    this.score = 0;
    this.updateScore();
    this.spawnRandomTile();
    this.spawnRandomTile();
    this.renderBoard();
  }

  getEmptyCells(){
    const result = [];
    for(let i=0;i<16;i++){
      if(this.board[i] === 0){
        result.push(i);
      }
    }

    return result;
  }

  spawnRandomTile(){
    const empty = this.getEmptyCells();

    if(empty.length === 0){
      return false;
    }

    const index = empty[ Math.floor( Math.random() * empty.length) ];
    const value = Math.random() < 0.9 ? 2 : 4;

    this.board[index] = value;
    this.createTile(value,index);

    return true;
  }

  updateScore(){
    this.scoreElement.textContent = this.score;
    this.bestScore = Math.max( this.bestScore, this.score);
    this.bestElement.textContent = this.bestScore;
  }

  renderBoard(){
    this.tileLayer.innerHTML = "";
    this.tiles.clear();

    for(let i=0;i<16;i++){
      const value = this.board[i];

      if(value === 0){
        continue;
      }

      this.createTile( value, i);
    }
  }

  moveLeft(){
    let changed = false;
    let totalScore = 0;

    for(let row=0;row<4;row++){
      const line = this.getRow(row);
      const result = this.compressLine(line);

      if(
        JSON.stringify(line) !==
        JSON.stringify(result.values)
      ){
        changed = true;
      }

      totalScore += result.scoreGain;
      this.setRow( row, result.values);
    }

    return { changed, scoreGain:totalScore };
  }

  moveRight(){
    let changed = false;
    let totalScore = 0;

    for(let row=0;row<4;row++){
      const line = this.getRow(row).reverse();
      const result = this.compressLine(line);
      const output = result.values.reverse();

      if(
        JSON.stringify( this.getRow(row)) !==
        JSON.stringify(output)
      ){
        changed = true;
      }

      totalScore += result.scoreGain;
      this.setRow( row, output);
    }

    return { changed, scoreGain:totalScore };
  }

  moveUp(){
    let changed = false;
    let totalScore = 0;

    for(let col=0;col<4;col++){
      const line = this.getColumn(col);
      const result = this.compressLine(line);

      if(
        JSON.stringify(line) !==
        JSON.stringify(result.values)
      ){
        changed = true;
      }

      totalScore += result.scoreGain;
      this.setColumn( col, result.values);
    }

    return { changed, scoreGain:totalScore };
  }

  moveDown(){
    let changed = false;
    let totalScore = 0;

    for(let col=0;col<4;col++){
      const line = this.getColumn(col).reverse();
      const result = this.compressLine(line);
      const output = result.values.reverse();

      if(
        JSON.stringify( this.getColumn(col)) !==
        JSON.stringify(output)
      ){
        changed = true;
      }

      totalScore += result.scoreGain;
      this.setColumn( col, output);
    }

    return { changed, scoreGain:totalScore };
  }

  move(direction){
    if(this.animating){
      return;
    }

    let result;
    switch(direction){
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
    }

    if(!result.changed){
      return;
    }
    this.score += result.scoreGain;
    this.updateScore();
    this.sound.move();
    this.spawnRandomTile();
    this.renderBoard();
  }
}

window.addEventListener("load", () => {
  window.game = new Game();
  game.startNewGame();
});


