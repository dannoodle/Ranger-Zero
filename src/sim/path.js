// Grid pathfinding. These functions only see the cost array they're handed, so a ranger's route
// comes from the ranger's map and never from the real one.

var RZ = RZ || {};

(function () {
  var DIAGONAL = 1.41421356;
  var stepX = [1, -1, 0, 0, 1, 1, -1, -1];
  var stepY = [0, 0, 1, -1, 1, -1, 1, -1];

  // A small binary heap of cell indices ordered by priority.
  function Heap() {
    this.cells = [];
    this.keys = [];
  }

  Heap.prototype.clear = function () {
    this.cells.length = 0;
    this.keys.length = 0;
  };

  Heap.prototype.push = function (cell, key) {
    var cells = this.cells;
    var keys = this.keys;
    var at = cells.length;
    cells.push(cell);
    keys.push(key);
    while (at > 0) {
      var parent = (at - 1) >> 1;
      if (keys[parent] <= key) break;
      cells[at] = cells[parent];
      keys[at] = keys[parent];
      at = parent;
    }
    cells[at] = cell;
    keys[at] = key;
  };

  Heap.prototype.pop = function () {
    var cells = this.cells;
    var keys = this.keys;
    var top = cells[0];
    var lastCell = cells.pop();
    var lastKey = keys.pop();
    var size = cells.length;
    if (size > 0) {
      var at = 0;
      for (;;) {
        var child = at * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        cells[at] = cells[child];
        keys[at] = keys[child];
        at = child;
      }
      cells[at] = lastCell;
      keys[at] = lastKey;
    }
    return top;
  };

  // Scratch space, reused between searches. A search never reads what an earlier one left behind.
  var scratch = { size: 0, best: null, from: null, stamp: null, done: null, generation: 0, heap: new Heap() };

  function prepare(size) {
    if (scratch.size !== size) {
      scratch.size = size;
      scratch.best = new Float32Array(size);
      scratch.from = new Int32Array(size);
      scratch.stamp = new Uint32Array(size);
      scratch.done = new Uint32Array(size);
      scratch.generation = 0;
    }
    scratch.generation++;
    scratch.heap.clear();
  }

  // A* from start to goal over a cost array (the cost of entering each cell, Infinity if blocked).
  // Returns { cells, cost } with the start left out, or null if there's no way through.
  RZ.findPath = function (w, h, costs, start, goal, minCost) {
    var size = w * h;
    prepare(size);
    var best = scratch.best;
    var from = scratch.from;
    var stamp = scratch.stamp;
    var done = scratch.done;
    var generation = scratch.generation;
    var heap = scratch.heap;
    var floor = minCost || 1;
    var goalX = goal % w;
    var goalY = Math.floor(goal / w);

    best[start] = 0;
    from[start] = -1;
    stamp[start] = generation;
    heap.push(start, 0);

    while (heap.cells.length) {
      var cell = heap.pop();
      if (done[cell] === generation) continue;
      done[cell] = generation;
      if (cell === goal) break;
      var x = cell % w;
      var y = (cell - x) / w;
      for (var k = 0; k < 8; k++) {
        var nx = x + stepX[k];
        var ny = y + stepY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var next = nx + ny * w;
        var cost = costs[next];
        if (cost === Infinity || done[next] === generation) continue;
        if (k >= 4 && (costs[x + ny * w] === Infinity || costs[nx + y * w] === Infinity)) continue; // no squeezing past corners
        var total = best[cell] + (k >= 4 ? cost * DIAGONAL : cost);
        if (stamp[next] === generation && total >= best[next]) continue;
        stamp[next] = generation;
        best[next] = total;
        from[next] = cell;
        var dx = Math.abs(nx - goalX);
        var dy = Math.abs(ny - goalY);
        var estimate = (dx + dy + (DIAGONAL - 2) * Math.min(dx, dy)) * floor;
        heap.push(next, total + estimate);
      }
    }

    if (done[goal] !== generation) return null;
    var cells = [];
    for (var at = goal; at !== start; at = from[at]) cells.push(at);
    cells.reverse();
    return { cells: cells, cost: best[goal] };
  };

  // Spreads outwards from the source cells and returns the cost of reaching every cell.
  // Unreachable cells stay at Infinity.
  RZ.costField = function (w, h, costs, sources) {
    var size = w * h;
    var field = new Float32Array(size);
    field.fill(Infinity);
    var heap = new Heap();
    for (var s = 0; s < sources.length; s++) {
      field[sources[s]] = 0;
      heap.push(sources[s], 0);
    }
    var done = new Uint8Array(size);
    while (heap.cells.length) {
      var cell = heap.pop();
      if (done[cell]) continue;
      done[cell] = 1;
      var x = cell % w;
      var y = (cell - x) / w;
      for (var k = 0; k < 8; k++) {
        var nx = x + stepX[k];
        var ny = y + stepY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var next = nx + ny * w;
        var cost = costs[next];
        if (cost === Infinity) continue;
        var total = field[cell] + (k >= 4 ? cost * DIAGONAL : cost);
        if (total < field[next]) {
          field[next] = total;
          heap.push(next, total);
        }
      }
    }
    return field;
  };
})();
