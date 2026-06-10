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

    document.getElementById("newButton").addEventListener( "click", ()=>{
      const ok = confirm( "現在のゲームを破棄して新しいゲームを開始しますか？");
      if(ok){
        this.startNewGame();
        this.saveGame();
      }
    });
    document.getElementById("undoButton").addEventListener( "click", ()=>
      this.undo()
    );
  }

  undo(){
    if(!this.undoState){
      return;
    }
    this.board = [...this.undoState.board];
    this.score = this.undoState.score;
    this.cleared = this.undoState.cleared;
    this.gameOver = this.undoState.gameOver;
    this.updateScore();
    this.syncTilesToBoard();
    this.saveGame();
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

    const data = { id, value, index, element:tile };
    this.tiles.set( id, data );

    this.updateTileAppearance(id);
    this.moveTileDOM(id,index,false);

    return data;
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
        result.push({ value: current, merged: false });
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
    this.syncTilesToBoard();
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
    return true;
  }

  updateScore(){
    this.scoreElement.textContent = this.score;
    this.bestScore = Math.max( this.bestScore, this.score);
    this.bestElement.textContent = this.bestScore;
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
    if(this.animating){ return; }
    if(this.gameOver){ return; }

    this.saveUndoState();
    const before = [...this.board];

    let result;
    switch(direction){
      case "left":
        result=this.moveLeft();
        break;
      case "right":
        result=this.moveRight();
        break;
      case "up":
        result=this.moveUp();
        break;
      case "down":
        result=this.moveDown();
        break;
    }

    if(!result.changed){
      return;
    }
    this.animating = true;
    this.score += result.scoreGain;
    this.updateScore();

    if(result.scoreGain>0){
      this.sound.merge();
      navigator.vibrate?.(40);
    }else{
      this.sound.move();
    }

    setTimeout(()=>{
      this.spawnRandomTile();
      this.syncTilesToBoard();
      this.checkClear();
      this.checkGameOver();
      this.saveGame();
      this.animating=false;
    },130);
  }

  saveUndoState(){
    this.undoState = {
      board:[...this.board],
      score:this.score,
      cleared:this.cleared,
      gameOver:this.gameOver
    };
  }

  saveGame(){
    const data = {
      board:this.board,
      score:this.score,
      bestScore:this.bestScore,
      undoState:this.undoState,
      cleared:this.cleared,
      gameOver:this.gameOver
    };
    localStorage.setItem( "2kPuzzle", JSON.stringify(data));
  }

  loadGame(){
    const raw = localStorage.getItem("2kPuzzle");
    if(!raw){
      this.startNewGame();
      return;
    }
    const data = JSON.parse(raw);
    this.board = data.board;
    this.score = data.score || 0;
    this.bestScore = data.bestScore || 0;
    this.undoState = data.undoState || null;
    this.cleared = data.cleared || false;
    this.gameOver = data.gameOver || false;
    this.updateScore();
    this.syncTilesToBoard();
  }

  syncTilesToBoard(){
    const existing = new Map();

    for(const tile of this.tiles.values()){
      existing.set( tile.index, tile);
    }

    for(let index=0;index<16;index++){
      const value = this.board[index];
      const tile = existing.get(index);

      if(value===0){
        if(tile){
          tile.element.remove();
          this.tiles.delete(tile.id);
        }

        continue;
      }
      if(tile){
        if(tile.value!==value){
          tile.value=value;
          this.updateTileAppearance(tile.id);
        }
        continue;
      }
      const newTile = this.createTile(value, index);
      newTile.element.classList.add( "tile-new");
    }
  }

  showMessage(text){
    this.messageElement.textContent = text;
    this.messageElement.classList.remove("message-hidden");
    this.messageElement.classList.add("message-show");
  }

  hideMessage(){
    this.messageElement.classList.remove("message-show");
    this.messageElement.classList.add("message-hidden");
  }

  checkClear(){
    if(this.cleared){
      return;
    }

    for(const value of this.board){
      if(value === 2048){
        this.cleared = true;
        this.showMessage(
          "2048!"
        );

        this.sound.clear();
        navigator.vibrate?.( [100,50,100]);
        setTimeout( ()=>this.hideMessage(), 1500);
        break;
      }
    }
  }

  canMove(){
    for(let i=0;i<16;i++){
      if(this.board[i]===0){
        return true;
      }
    }
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const idx = r*4+c;
        const value = this.board[idx];
        if(c<3){
          if( value === this.board[idx+1]){
            return true;
          }
        }

        if(r<3){
          if( value === this.board[idx+4]){
            return true;
          }
        }
      }
    }
    return false;
  }

  checkGameOver(){
    if(this.canMove()){
      return;
    }
    this.gameOver = true;
    this.showMessage( "GAME OVER");
    this.sound.gameOver();
    navigator.vibrate?.( [200,100,200]);
  }
}

window.addEventListener("load", () => {
  window.game = new Game();
  game.loadGame();
});


