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

    this.board = new Array(Game.CELL_COUNT).fill(null);
    this.tileElements = new Map();
    this.lastMoveInfo = [];
    this.undostate = null;
    this.beforestate = null;

    this.setupInput();

    this.nextTileId = 1;
    this.score = 0;
    this.bestScore = 0;

    this.animating = false;

    this.cellSize = 0;
    this.cellGap = 10;

    this.createBackgroundCells();
    this.calculateLayout();

    window.addEventListener("resize", () => {
      this.calculateLayout();
      this.syncTilesToBoard();
    });

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
    if (this.gameOver) {
      this.hideMessage();
    }
    this.board = structuredClone( this.undoState.board);
    this.nextTileId = this.undoState.nextTileId;
    this.score = this.undoState.score;
    this.cleared = this.undoState.cleared;
    this.gameOver = this.undoState.gameOver;
    this.updateScore();

    // DOM全再構築
    this.tileLayer.innerHTML = "";
    this.tileElements.clear();
    for(let index=0; index<16; index++){
      const tileData = this.board[index];
      if(tileData){
        this.createTile(tileData, index);
      }
    }

    this.saveGame();
  }

  setupInput(){
    const board = this.boardElement;
    let startX = 0;
    let startY = 0;
    let activePointerId = null;

    board.addEventListener( "pointerdown", e => {
      board.setPointerCapture(e.pointerId);
      activePointerId = e.pointerId;

      startX = e.clientX;
      startY = e.clientY;
    });

    board.addEventListener( "pointerup", e => {
      if(activePointerId !== e.pointerId){
        return;
      }
      activePointerId = null;
      board.releasePointerCapture(e.pointerId);

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if( Math.abs(dx) < 30 && Math.abs(dy) < 30){
        return;
      }

      if(Math.abs(dx) > Math.abs(dy)){
        this.move( dx > 0 ? "right" : "left");
      }else{
        this.move( dy > 0 ? "down" : "up");
      }
    });

    board.addEventListener("pointercancel", e => {
      if(board.hasPointerCapture(e.pointerId)){
        board.releasePointerCapture(e.pointerId);
      }
      activePointerId = null;
      startX = 0;
      startY = 0;
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
  
  createTile(tileData, index){
    const id = tileData.id;
    const tile = document.createElement("div");

    tile.className = "tile";
    tile.dataset.id = id;
    this.tileLayer.appendChild(tile);
    this.tileElements.set( id, tile );
    this.updateTileAppearance(id, tileData.value);
    this.moveTileDOM(id,index,false);

    return tile;
  }

  moveTileDOM(id,index,animate=true){
    const element = this.tileElements.get(id);
    if(!element) { return; }
    const pos = this.indexToPosition(index);

    if(!animate){
      element.style.transition = "none";
    }

    element.style.left = pos.left + "px";
    element.style.top = pos.top + "px";
    
    if(!animate){
      element.offsetHeight;
      element.style.transition = "";
    }
  }

  updateTileAppearance(id, value){
    const el = this.tileElements.get(id);

    el.style.width = this.cellSize + "px";
    el.style.height = this.cellSize + "px";
    el.style.fontSize = Math.max( 20, 40 - String(value).length * 4) + "px";
    el.textContent = value;

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

    el.style.background = colors[value] || "#3c3a32";
    el.style.color = value >= 8 ? "#fff" : "#776e65";
  }

  compressLine(cells){
    const result = [];
    const moves = [];
    let scoreGain = 0;

    for(const current of cells){
      if(!current){
        continue;
      }
      const last = result[result.length - 1];

      if(
        last &&
        !last.merged &&
        last.value === current.value
      ){
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
          newValue
        });
        // 消える側
        moves.push({
          id: current.id,
          from: current.source,
          to: targetPos,
          merged: true,
          removed: true,
          newValue
        });
      }else{
        result.push({
          id: current.id,
          value: current.value,
          source: current.source,
          merged: false,
        });
      }
    }
    result.forEach((cell,to)=>{
      const alreadyMerged = moves.some( m => m.id === cell.id);
      if(!alreadyMerged){
        moves.push({
          id: cell.id,
          from: cell.source,
          to,
          merged: false,
          removed: false,
          newValue: cell.value
        });
      }
    });
    const boardLine = result.map(cell => ({
        id: cell.id,
        value: cell.value
    }));

    while(boardLine.length < 4){
      boardLine.push(null);
    }

    return {
      line: boardLine,
      scoreGain,
      moves
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
    this.board.fill(null);
    this.tileElements.clear();
    this.tileLayer.innerHTML = "";
    this.lastMoveInfo = [];
    this.undostate = null;
    this.beforestate = null;
    this.cleared = false;
    this.gameover = false;
    this.nexttileid = 1;
    this.score = 0;

    this.hidemessage();

    this.updatescore();
    this.spawnrandomtile();
    this.spawnrandomtile();
    this.synctilestoboard();
  }

  getemptycells(){
    const result = [];
    for(let i=0;i<16;i++){
      if(this.board[i] === null){
        result.push(i);
      }
    }

    return result;
  }

  spawnrandomtile(){
    const empty = this.getemptycells();
    if(empty.length === 0){
      return false;
    }

    const index = empty[ math.floor( math.random() * empty.length) ];
    this.board[index] = {
      id: this.nexttileid++,
      value: math.random() < 0.9 ? 2 : 4
    };
    return true;
  }

  updatescore(){
    this.scoreelement.textcontent = this.score;
    this.bestscore = math.max( this.bestscore, this.score);
    this.bestelement.textcontent = this.bestscore;
  }

  moveleft(){
    let changed = false;
    let totalscore = 0;

    for(let row=0;row<4;row++){
      const line = this.getrow(row);
      const cells = line.map((value,col)=>{
        const index = this.rowcoltoindex(row,col);
        const tile = this.board[index];
        return tile
          ? {
              ...tile,
              source:index
            }
          : null;
      });
      const result = this.compressline(cells);
      if(
        json.stringify(line) !==
        json.stringify(result.line)
      ){
        changed = true;
      }

      totalscore += result.scoregain;
      this.setrow( row, result.line);
      for(const move of result.moves){
        this.lastmoveinfo.push({
          ...move,
          to:this.rowcoltoindex(row, move.to)
        });
      }
    }
    return { changed, scoregain:totalscore };
  }

  moveright(){
    let changed = false;
    let totalscore = 0;

    for(let row=0;row<4;row++){
      const line = this.getrow(row);
      const cells = [...line].reverse().map((value, col) => {
        const index = this.rowcoltoindex(row, 3 - col);
        const tile = this.board[index];
        return tile
          ? {
              ...tile,
              source:index
            }
          : null;
      });
      const result = this.compressline(cells);
      const output = [...result.line].reverse();
      if(
        json.stringify( this.getrow(row)) !==
        json.stringify(output)
      ){
        changed = true;
      }

      totalscore += result.scoregain;
      this.setrow(row, output);
      for(const move of result.moves){
        this.lastmoveinfo.push({
          ...move,
          to:this.rowcoltoindex(row, 3 - move.to)
        });
      }
    }
    return { changed, scoregain:totalscore };
  }

  moveup(){
    let changed = false;
    let totalscore = 0;

    for(let col=0;col<4;col++){
      const line = this.getcolumn(col);
      const cells = line.map((value,row)=>{
        const index = this.rowcoltoindex(row,col);
        const tile = this.board[index];
        return tile
          ? {
              ...tile,
              source:index
            }
          : null;
      });
      const result = this.compressline(cells);

      if(
        json.stringify(line) !==
        json.stringify(result.line)
      ){
        changed = true;
      }

      totalscore += result.scoregain;
      this.setcolumn( col, result.line);
      
      for (const move of result.moves) {
        this.lastmoveinfo.push({
          ...move,
          to: this.rowcoltoindex(move.to, col)
        });
      }
    }

    return { changed, scoregain:totalscore };
  }

  movedown(){
    let changed = false;
    let totalscore = 0;

    for(let col=0;col<4;col++){
      const line = this.getcolumn(col);
      const cells = [...line].reverse().map((value, row) => {
        const index = this.rowcoltoindex(3 - row, col);
        const tile = this.board[index];
        return tile
          ? {
              ...tile,
              source:index
            }
          : null;
      });
      const result = this.compressline(cells);
      const output = [...result.line].reverse();

      if(
        json.stringify( this.getcolumn(col)) !==
        json.stringify(output)
      ){
        changed = true;
      }

      totalscore += result.scoregain;
      this.setcolumn( col, output);
      
      for (const move of result.moves) {
        this.lastmoveinfo.push({
          ...move,
          to: this.rowcoltoindex( 3 - move.to, col)
        });
      }
    }
    return { changed, scoregain:totalscore };
  }

  move(direction){
    if(this.animating){ return; }
    if(this.gameover){ return; }

    this.savebeforestate();
    this.lastmoveinfo = [];

    let result;
    switch(direction){
      case "left":
        result=this.moveleft();
        break;
      case "right":
        result=this.moveright();
        break;
      case "up":
        result=this.moveup();
        break;
      case "down":
        result=this.movedown();
        break;
    }

    if(!result.changed){
      this.beforestate = null;
      return;
    }
    this.undostate = this.beforestate;
    this.beforestate = null;
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

  saveBeforeState(){
    this.beforeState = {
      board:structuredClone(this.board),
      nextTileId:this.nextTileId,
      score:this.score,
      cleared:this.cleared,
      gameOver:this.gameOver
    };
  }

  saveGame(){
    const data = {
      board:this.board,
      nextTileId:this.nextTileId,
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

    this.tileElements.clear();
    this.tileLayer.innerHTML = "";
    this.lastMoveInfo = [];

    this.board = data.board;
    this.nextTileId = data.nextTileId;
    this.score = data.score || 0;
    this.bestScore = data.bestScore || 0;
    this.beforeState = null;
    this.undoState = data.undoState || null;
    this.cleared = data.cleared || false;
    this.gameOver = data.gameOver || false;
    this.updateScore();
    this.syncTilesToBoard();
    if(this.gameOver){
      this.showMessage( "GAME OVER");
    }
  }

  syncTilesToBoard(){
    const aliveIds = new Set();

    for(const move of this.lastMoveInfo){
      const element = this.tileElements.get(move.id);
      if(!element){
        continue;
      }
      this.moveTileDOM( move.id, move.to, true);

      if(move.removed){
        element.classList.add( "tile-merge-remove");

        setTimeout(()=>{
          element.remove();
          this.tileElements.delete(move.id);
        },120);
      }else{
        aliveIds.add(move.id);
        if(move.merged){
          const tileData = this.board[move.to];
          if(tileData) {
            this.updateTileAppearance(
              move.id,
              tileData.value
            );
          }
          element.classList.remove("tile-pop");
          void element.offsetWidth;
          element.classList.add("tile-pop");
        }
      }
    }

    // 盤面上に存在する全ID
    const boardIds = new Set();
    for(let index=0; index<16; index++){
      const tileData = this.board[index];
      if(!tileData){
        continue;
      }
      boardIds.add(tileData.id);

      // 新規生成タイル
      const isExistTile = this.tileElements.has(tileData.id);
      if(!isExistTile){
        const element = this.createTile(tileData, index);
        element.classList.add("tile-new");
      }
    }
    // 念のため孤立DOM掃除
    for(const [id, element] of this.tileElements){
      if(!boardIds.has(id)){
        element.remove();
        this.tileElements.delete(id);
      }
    }
    this.lastMoveInfo = [];
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

    for(const tile of this.board){
      if(tile && tile.value === 2048){
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
      if(this.board[i] === null){
        return true;
      }
    }
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const idx = r*4+c;
        const tile = this.board[idx];
        if(c<3){
          const right = this.board[idx + 1];
          if(
            tile && right &&
            tile.value === right.value
          ){
            return true;
          }
        }

        if(r<3){
          const down = this.board[idx + 4];
          if(
            tile && down &&
            tile.value === down.value
          ){
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


