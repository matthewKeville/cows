//Set Canvas and Viewport dimensions
const canvas = document.querySelector('#mainCanvas');
const width = canvas.width = window.innerWidth;
const height = canvas.height = window.innerHeight;
const ctx = canvas.getContext('2d'); // ctx is a CanvasRenderingContext2D

//dummy tile
class emptyTile {
  constructor() {}
  update() {}
  style() { return 'rgb(0,0,255)';};
}

/**
 * Shape is either a hex , *triangle, or square.
  They grow as the update function is called by it's growth rate
  The alpha value of the color of the grass tile indicates growth.
*/
class grassTile {
  static baseGrowthRate = .002;
  static maxGrowth = 10;
  constructor(growth,rate) {
    //defaults , no args
    if (growth == null) {
      //console.log("no args");
      growth = .5 * Math.random() * grassTile.maxGrowth;
      //growth = 0;
      rate = Math.random()*3*grassTile.baseGrowthRate;
      //console.log(growth,rate);
    }

    // growth can't be 0 or ge than max
    if (growth > grassTile.maxGrowth || growth < 0) {
     throw new Error();
    }
    this.growth = growth; // [0,1]
    this.rate   = rate;
  }

  update() {
    if (this.growth < grassTile.maxGrowth) {
      this.growth += this.rate*grassTile.maxGrowth;
      if (this.growth > grassTile.maxGrowth) {
        this.growth = grassTile.maxGrowth;
      }
    }
  }
  
  //inform shape how to color this tile
  style() {
    return 'rgba(0,255,0,' + (this.growth/grassTile.maxGrowth) +')';
  }

}

class waterTile {
  static maxDepth = 10;
  static baseAlpha = .3;

  constructor(depth = Math.random()*waterTile.maxDepth) {
    this.depth = depth;
  }

  //inform shape how to color this tile
  style() {

    //return 'rgba(0,255,0,' + (this.growth/grassTile.maxGrowth) +')';
    return 'rgba(0,0,255,' + ((this.depth/waterTile.maxDepth)*(1-waterTile.baseAlpha)+waterTile.baseAlpha) +')';
    //return 'rgba(0,0,255)'
  }

  update() {

  }
}

//tile here means shape ...
//maybe change 'tile' to type and 'shape' to tile
class cow {
  constructor(node,size,color,ctx) {
    this.node = node;
    this.size = size;
    this.color = color;
    this.ctx = ctx;

    this.name = "bob";
    this.health = 100;
    this.hunger = 0;

    /* test for now , PATH2D should be expanded on the future,
     * to be used for the draw method. I will code duplicate for time
     * being as proof of concept. Ideally, on construction 
     * this.path will be assigned and when drawing happens, it will reference
     * it. If translation happens it will update underlying path2D. This will
     * reduce computational overhead of calculating the vertices of the
     * path on every frame
     */
 
     this.path = new Path2D();
     this.path.arc(this.node.cp.x,this.node.cp.y,this.size,0,2*Math.PI);
  }

  //draw a circle
  draw() {
    this.ctx.save();
    this.ctx.fillStyle=this.color;
    this.ctx.fill(this.path);
    this.ctx.restore();
  }


  update() {
    //will I move?
    let move = false;
    let moveRoll = Math.random()*100;
    if (moveRoll > 40) {
      move = true;
    }
    //debug setting right now
    //move = false;

      if (move) {
      let moves = []
      this.node.neighbors.forEach( nt => {
        if ( nt.occupant == null ) {
          moves.push(nt);
        }
      });
      if (moves.length != 0) {
        let dir = Math.floor( Math.random() * moves.length);
        //let tile know I left
        this.node.occupant = null;
        //remind myself where I am
        this.node = moves[dir];
        //let tile now I'm here
        this.node.occupant = this;
        //update the rendering path for the cow
        this.path = new Path2D();
        this.path.arc(this.node.cp.x,this.node.cp.y,this.size,0,2*Math.PI);
      } else {
        //console.log("tried to move, but couldn't");
      }
    }
  }

}

////////////////////
//Utility
///////////////////



class point {
  static epsilon = .001;
  constructor(x,y) {
    this.x = x;
    this.y = y;
  }
 
  //euclidian distance
  dist(p2) {
    return Math.sqrt(Math.pow(p2.x - this.x,2) + Math.pow(p2.y - this.y,2));
  }
  
  //if these two points are within epsilon of each other
  //they are equal
  equals(p2) {
    return (this.dist(p2) < point.epsilon);
  }

  //add to points
  add(p2) {
    return new point(this.x+p2.x,this.y+p2.y);
  }

  sub(p2) {
    return new point(this.x-p2.x,this.y-p2.y);
  }

  clone() {
    return new point(this.x,this.y);
  }
}

//Given an angle r in radians
//Return r' such that 0<=r<=2*PI
function relativeAngle(r) {
  //how many revolutions?
  if ( r > 0 ) {
    revs = Math.floor(r/(2*Math.PI));
    return (r - (revs*2*Math.PI));
  } else {
    revs = Math.floor(-r/(2*Math.PI));
    return (r + 2*Math.PI + revs*2*Math.PI);
  }
}

//convert polar to rectangular
function p2r(r,theta) {
  return new point(r*Math.cos(theta),r*Math.sin(theta));
}

//rectangular to polar
function r2p(p1) {
  let r = Math.sqrt( Math.pow(p1.x,2) + Math.pow(p1.y,2));
  /* atan2 returns angle between (y,x) and (0,0)
   */
  let t = Math.atan2(p1.y,p1.x);
  return new point(r,t);
}


//draw a circle with the gfx ctx
function drawCirc(x,y,r) {
  ctx.fillStyle='rgb(0,0,0)';
  ctx.beginPath();
  ctx.arc(x,y,r,0,2*Math.PI);
  ctx.fill();
  ctx.closePath();
}

/////////////////////////
// Map Generation
// //////////////////////

/*
 * A curve contains a radial function. That is
 * given an angle theta, it will be able to produce
 * a radius r, thus given all points on the curve.
 *
 * The radial variable will be a function whose input is theta
 * and returns a radius from the center of the curve
 */
class curve {
  constructor(center,radial,ctx) {
    //center of curve
    this.center = center;
    //radial function
    this.radialBase = radial;
    //graphics context
    this.ctx = ctx;
    //presentation scale
    //display will misalign with the underlying radial
    //function
    this.scale = 1;
  }

  clone(){
    return new curve(this.center,this.radialBase,this.scale);
  }
  //draw this curve with the desired number of
  //revolutions and precision
  draw(revs,iters) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgb(255,0,0)' ;

    //move ctx to middle of curve
    this.ctx.translate(this.x,this.y); 
    
    //draw a circle at the center of the curve 
    //drawCirc(this.x,this.y,5);

    this.ctx.beginPath();

    let dtheta = revs * (2*Math.PI) / iters; 
    for ( var i = 0; i <= iters; i++) {
      //current angle
      let z = dtheta*i;
      //current radius scaled by curve.scale
      let r = this.radial(z);

      let xy = p2r(r,z);
      //translate to center
      xy = xy.add(this.center);

        //console.log(xi + " , " + yi);
        if ( i!= 0 ) {
          this.ctx.lineTo(xy.x,xy.y);
          //if this is the first point, don't draw a line, just start the path
        } else {
          this.ctx.moveTo(xy.x,xy.y);
        }
      }
    //draw path
    this.ctx.stroke();
    this.ctx.closePath();
    //restore state of transform
    this.ctx.restore();
  }

  moveTo(point) {
    this.center = point;
  }

  copy() {
    return new curve(this.center,this.radial,this.ctx);
  }

  setScale(s) {
    this.scale = s;
  }

  //agnostic of center point
  radial(z) {
    return this.scale * this.radialBase(z);
  }
}


///////////////////
//radial functions
///////////////////

//assume that the center of these curves is the origin 
//of the cartesian plane
// This class represents a random closed curved with a sinusuidal basis
// The class will allow the computation of points on this curve from [0,2PI]
// And will have methods to draw the graph
function closedCurveFactory(minPeriod,maxPeriod,minAmplitude,maxAmplitude,scale,length,iters) 
  {
  
  /////////////////////////////////////////////////////////////// 
  //calculate wave numbers,amplitudes,and an infinum lower bound
  ///////////////////////////////////////////////////////////////

  //f indicates the vars belonging to the generating call
  var famps = [];
  var fperiods = [];
  for (let k = 0; k < length; k++) {
    //amplitude
    let amp = Math.random() * Math.abs(maxAmplitude - minAmplitude) + minAmplitude;
    let period = Math.ceil(Math.random() * Math.abs(maxPeriod - minPeriod) + minPeriod);
    famps.push(amp);
    fperiods.push(period);
  }
  //////////////////////////////
  //infinum lower bound
  //////////////////////////////

  //allows us to force this radial parameterization to be >= 0. 
  //which guarantess that this curve has no self intersections
  var finf = 0;
  for ( let k = 0; k < length; k++) {
    finf += Math.abs(famps[k]);
  }


  //calculate the radial function at a given value of theta
  //addition to computed radial generates a more circular shape
  //multiplication strictly amplifys scale
  //must be somewhat to integrate smoothness and scale , without
  //overscaling the shape
  let radial = function(theta) {
    //make a local copy of the values passed to the parent function 
    //to be referenced in this self contained function
    let amps = famps;
    let periods = fperiods;
    let inf = finf;
    //calculate the radial from this sinusuidal composition
    let radial = 0;
    for ( let k = 0; k < length; k++ ) {
      radial += amps[k]*Math.sin(periods[k]*theta);
    } 
    //add the lower infinum bound to this value to ensure non-self intersection
    radial += Math.abs(inf);
    //radial += 300; //as we add to the radial function it smooths out and becomes more circular
    //I suppose we can compose any closed shap , such as an ellipse with the fourier series to create a a more elliptical shape
    radial += 10;
    radial *= scale;
    //console.log(theta, " : " , radial);
    return radial;
  }
  return radial;

 }



//generate radial functions for rectangles of
//given height and width
function rectRadialFactory(width,height) {

  //source : 
  //https://math.stackexchange.com/questions/1703952/polar-coordinates-vector-equation-of-a-rectangle
  let radial = function(z) {
    //find relative angle in [0,2PI]
    z = relativeAngle(z);
    let a = width/2;
    let b = height/2;

    if ( Math.abs(Math.tan(z)) <= b/a) {
      return a / Math.abs(Math.cos(z));
    } else {
      return b / Math.abs(Math.sin(z));
    }
  }
  return radial;
}




class hex {
  static maxNeighbors = 6;
  static interiorAngle = Math.PI/3; //60 degrees
  constructor(cp,size,ctx) {
    this.cp = cp;
    //redundant , but will fix later
    //i.e. cp and x and y
    this.x = cp.x;
    this.y = cp.y;
    this.size = size;
    //neighbors
    this.neighbors = [];
    this.tile = new emptyTile();
    this.occupant = null;
    this.ctx = ctx; 
    //create the canvas path for drawing
    let path = new Path2D();
    let offset = Math.PI/6;
    let vertices = [];
    for ( let i = 0; i < 6; i++) {
      let theta = (2*Math.PI*i/6) + offset  
      let vx = this.x + this.size*Math.cos(theta);
      let vy = this.y + this.size*Math.sin(theta);
      vertices.push([vx,vy]);
    }
    
    path.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < 6; i++) {
      path.lineTo(vertices[i][0],vertices[i][1]);
    }
    path.lineTo(vertices[0][0],vertices[0][1]);
    this.path = path;
  }

  update() {
    this.tile.update();
  }

  //outline this hex
  drawOutline() {
    this.ctx.save();
    this.ctx.stroke(this.path);
    this.ctx.restore();
  }

  //given a color, fill this hex with that color
  draw() {
    this.ctx.save();
    this.ctx.fillStyle = this.tile.style();
    this.ctx.fill(this.path);
    this.ctx.restore();
  }

   getPoint() {
     return this.cp;
   }

  //check equality by way of hex centerpoint
  equals(h2) {
    //console.log(h2);
    //console.log(this);
    return this.cp.equals(h2.cp);
  }

  //return a list of hex center points that neighbor this hex physically
  neighborhood() {
    let hcp  = this.cp;
    let nbrs = [];
    let hexGap = Math.sqrt(3)*this.size
    for (let i = 0; i < 6;i++) {
      let diffVector = p2r(hexGap,2*Math.PI*i/6);
      let nx = hcp.x + diffVector.x;
      let ny = hcp.y + diffVector.y;
      let hcnp = new point(nx,ny);
      nbrs.push(hcnp);
    }
    return nbrs;
  }

  
}


////////////////////////////////////
//Unfinished Square Implementation//
////////////////////////////////////
 
class square {
  static maxNeighbors = 4;
  static interiorAngle = Math.PI/2; //60 degrees
  constructor(cp,size,ctx) {
    this.cp = cp;
    this.size = size;
    //neighbors
    this.neighbors = [];
    this.tile = new emptyTile();
    //this.offset = 7*Math.PI/4;  //straight up in pixel space
    //45 degrees
    this.offset = Math.PI/3;
    this.ctx = ctx;
  }

  update() {
    this.tile.update();
  }

  //outline this triangle
  //distance from center to any vertex is a/sqrt(3)
  drawOutline() {
    //console.log("drawing triangle outline"); 
    let vertices = [];
    //drawCirc(this.cp.x,this.cp.y,5);
    for ( let i = 0; i < 4; i++) {
      let theta = (2*Math.PI*i/4) + this.offset  
      let diffVector = p2r(this.size*Math.sqrt(.5),theta);
      let vx = this.cp.x + diffVector.x;
      let vy = this.cp.y + diffVector.y;
      //drawCirc(vx,vy,3);
      vertices.push([vx,vy]);
    }
    //console.log(vertices);
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < 4; i++) {
      this.ctx.lineTo(vertices[i][0],vertices[i][1]);
    }
    this.ctx.lineTo(vertices[0][0],vertices[0][1]);
    this.ctx.stroke();
    this.ctx.closePath();
    this.ctx.restore();
  }


  draw() {
    //console.log("square"); 
    this.ctx.fillStyle = this.tile.style();
    let vertices = [];
    for ( let i = 0; i < 4; i++) {
      let theta = (2*Math.PI*i/4) + this.offset  
      let diffVector = p2r(this.size*Math.sqrt(.5),theta);
      let vx = this.cp.x + diffVector.x;
      let vy = this.cp.y + diffVector.y;
      vertices.push([vx,vy]);
    }
    //console.log(vertices);
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < 4; i++) {
      this.ctx.lineTo(vertices[i][0],vertices[i][1]);
    }
    this.ctx.lineTo(vertices[0][0],vertices[0][1]);
    this.ctx.fill();
    this.ctx.closePath();
    this.ctx.restore();

    this.drawOutline();
  }

   getPoint() {
     return this.cp;
   }

  //check equality by way of hex centerpoint
  equals(h2) {
    //console.log(h2);
    //console.log(this);
    return this.cp.equals(h2.cp);
  }

  //return a list of hex center points that neighbor this hex physically
  neighborhood() {
    let nbrs = [];
    let gap = this.size
    for (let i = 0; i < 4;i++) {
      //offset point to first vertex, then PI/3 = 60* to middle of edge
      let diffVector = p2r(gap,this.offset+Math.PI/4+Math.PI/2*i);
      let nx = this.cp.x + diffVector.x;
      let ny = this.cp.y + diffVector.y;
      //drawCirc(nx,ny,5);
      let tcp = new point(nx,ny);
      nbrs.push(tcp);
    }
    return nbrs;
  }
}



////////////////////////////////////
//Unfinished Triangle Implementation
////////////////////////////////////

/*
 
//One hiccup in this generalization, 
//triangles, unlike hexagons, and squares will have
//alternating orientations. thus requires an offest
//I will table this for now
 
class triangle {
  static maxNeighbors = 3;
  static interiorAngle = 2*Math.PI/3; //60 degrees
  constructor(cp,size,ctx) {
    this.cp = cp;
    this.size = size;
    //neighbors
    this.neighbors = [];
    this.tile = new emptyTile();
    this.offset = 3*Math.PI/2;  //straight up in pixel space
  }

  update() {
    this.tile.update();
  }

  //outline this triangle
  //distance from center to any vertex is a/sqrt(3)
  drawOutline() {
    //console.log("drawing triangle outline"); 
    let vertices = [];
    //drawCirc(this.cp.x,this.cp.y,5);
    for ( let i = 0; i < 3; i++) {
      let theta = (2*Math.PI*i/3) + this.offset  
      let diffVector = p2r(this.size/Math.sqrt(3),theta);
      let vx = this.cp.x + diffVector.x;
      let vy = this.cp.y + diffVector.y;
      //drawCirc(vx,vy,3);
      vertices.push([vx,vy]);
    }
    //console.log(vertices);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < 3; i++) {
      ctx.lineTo(vertices[i][0],vertices[i][1]);
    }
    ctx.lineTo(vertices[0][0],vertices[0][1]);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  //given a color, fill this hex with that color
  draw() {
    //ask the underlying tile type, what to color myself
    ctx.fillStyle = this.tile.style();
    let offset = Math.PI/6;
    let vertices = [];
    for ( let i = 0; i < 6; i++) {
      let theta = (2*Math.PI*i/6) + offset  
      let vx = this.x + this.size*Math.cos(theta);
      let vy = this.y + this.size*Math.sin(theta);
      vertices.push([vx,vy]);
    }
    ctx.save();
    ctx.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < 6; i++) {
      ctx.lineTo(vertices[i][0],vertices[i][1]);
    }
    ctx.lineTo(vertices[0][0],vertices[0][1]);
    ctx.fill();
    ctx.restore();

    //and draw outline
    this.drawOutline();

  }

   getPoint() {
     return this.cp;
   }

  //check equality by way of hex centerpoint
  equals(h2) {
    //console.log(h2);
    //console.log(this);
    return this.cp.equals(h2.cp);
  }

  //return a list of hex center points that neighbor this hex physically
  neighborhood() {
    let nbrs = [];
    let hexGap = 1/Math.sqrt(12)*this.size*2;
    for (let i = 0; i < 3;i++) {
      //offset point to first vertex, then PI/3 = 60* to middle of edge
      let diffVector = p2r(hexGap,this.offset+Math.PI/3+(2*Math.PI*i/3));
      let nx = this.cp.x + diffVector.x;
      let ny = this.cp.y + diffVector.y;
      //drawCirc(nx,ny,5);
      let tcp = new point(nx,ny);
      nbrs.push(tcp);
    }
    return nbrs;
  }
}

*/

//Given a polar parameterization of a closed curve, 
//A center point, and a hexsize, construct a hex tiling
//radiating from the center point, such that the center points of 
//all generated hexes fall within the boundary of the given curve
class grid {

  constructor(curve,shape,size,ctx) {
    this.ctx = ctx;
    //Center of bounding box
    this.cp = curve.center;
    //draw the bounding curve
    this.curve = curve;
    this.curve.draw(1,1000);

    //the constructor of the tiling shape
    this.shape = shape;

    this.size = size;

    this.centerShape = new this.shape(this.cp,size,ctx);
    this.centerShape.drawOutline();

    this.debugCounter = 0;
    this.oobCounter = 0;

    var closed = [];

    var frontier = [];
    frontier.push(this.centerShape);

    [this.frontier,this.closed] = this.tileFill(frontier,closed);

  }

  //determine whether this hexes center is between the bounding box
  //I should generalize so that inBounds can be given a closed non-intersecting
  //path to generate hexgrids of any shape.
  inBounds(hcp) {

    //get the distance vector from the center point
    hcp = hcp.sub(this.cp);

    //convert hcp to polar
    let phcp = r2p(hcp);

    //if the curve's radius at theta is larget than 
    //this hexes distance from the center hex, then it's inside
    if ( phcp.x <= this.curve.radial(phcp.y) ) {
      return true;
    } else {
      return false
    }
 }


  // 0 -> 2*Math.PI*5/6
  tileFill(frontier,closed) {

    //nothing left to explore
    if (frontier.length == 0 ) {
      if (frontier.length != 0) {
      }
      return [frontier,closed];

    //check for new valid neighbors in the frontier
    } else {
      //get a copy of the frontier
      let newFrontier = [];
      //iterate through the current frontier and find all valid neighbors
      frontier.forEach( tcp => {
        //add all valid neighbors to the frontier
        //get all physically valid neighboring hexes
        var tncp = tcp.neighborhood();
        var tmcp = [];
        //sort out neighbors that are not inbounds
        tncp.forEach( t => {
         if (this.inBounds(t)) {
           tmcp.push(t);
         }
        });

        //determine if these hexes have been visited before, or are
        //queued to be visited
        tmcp.forEach( tmcpn => {
          
          //check if this point exists in closed
          //this will check all values
          //.every is like .forEach but will terminate if a false value is returned
         
          //does this hex point exist in closed?
          var closedIndex = -1;
          for ( let i = 0; i < closed.length; i++) {
            if ( closed[i].cp.equals(tmcpn)) {
              closedIndex = i;
            }
          }
          
          //does this hex point exist in the frontier?
          var frontIndex = -1;
          for ( let i = 0; i < frontier.length; i++ ) {
            if ( frontier[i].cp.equals(tmcpn)) {
              frontIndex = i; 
            }
          }

          //does this hex point exist in the new frontier?

          var newFrontIndex = -1;
          for ( let i = 0; i < newFrontier.length; i ++) {
            if ( newFrontier[i].cp.equals(tmcpn)) {
              newFrontIndex = i;
            }
          }

          let notFoundInClosed = (closedIndex == -1);
          let notInFrontier = (frontIndex  == -1);
          let notInNewFrontier = ( newFrontIndex == -1);

          //Find the hex node, if it already exists
          //and assign the root node its reference
          if (!notFoundInClosed) {
            tcp.neighbors.push(closed[closedIndex]); 
          }

          if (!notInFrontier) {
            tcp.neighbors.push(frontier[frontIndex]);
          }

          if (!notInNewFrontier) {
            tcp.neighbors.push(newFrontier[newFrontIndex]);
          }


          //neighbor doesn't exist, add to the frontier
          //assign reference to root node
          if (notFoundInClosed && notInFrontier && notInNewFrontier) {
            let newTile = new this.shape(tmcpn,this.size,this.ctx);
            tcp.neighbors.push(newTile);
            newFrontier.push(newTile);
          }
       });
      });
      
      //remove oldFrontier values from new frontier
      //add them to the closed
      frontier.forEach( hcp => {
        closed.push(hcp);
      });

      //recurse
      this.debugCounter++;
      return this.tileFill(newFrontier,closed);
    }
  }

  //@precondition : tileFill has been called
  //remove tiles from the grid at random, bias removal towards the center of the grid
  //i.e. lower indices
  //sparsity -> percentage of tiles to remove
  randomRemoval(sparsity) {
    if ( sparsity < 0 || sparsity > 1) {
      console.warn("invalid sparsity for grid random removal");
    }
    //this.closed
    let quota = Math.floor(this.closed.length*sparsity);
    while (quota != 0) {
      let kill = Math.floor(Math.random()*this.closed.length);
      let dead = (this.closed.splice(kill,1));
      dead = dead[0];
      ctx.fillRect(dead.cp.x,dead.cp.y,10,10);
      console.log(dead);
      //remove this tile's neighbors references to this tile.
      dead.neighbors.forEach( n => {
        let deadReferenceIndex = n.neighbors.indexOf(dead);
        if (deadReferenceIndex == -1) {
          console.log("houston we have a problem");
        } else {
          n.neighbors.splice(deadReferenceIndex,1);
        }
      }); 
      
      quota--;
    }
  }


  //@precondition : tileFill has been called
  //remove tiles from the grid at random, bias removal towards the center of the grid
  //i.e. lower indices
  //sparsity -> percentage of tiles to remove
  randomTileSwap(coverage,typeCon) {
    if ( coverage < 0 || coverage > 1) {
      console.warn("invalid coverage for grid random removal");
    }
    //this.closed
    let quota = Math.floor(this.closed.length*coverage);
    while (quota != 0) {
      let swap = Math.floor(Math.random()*this.closed.length);
      let shape = this.closed[swap]
      console.log("swapping type");
      console.log(shape);
      shape.tile = new typeCon();
      console.log(shape);
      quota--;
    }
  }


  //pick out random patches of tile, such that
  //of varying size until the sparsity quota has been meet
  //should be able to specify level of recursion or recursion range
  //and sparsity, how to satisfy both?
  patchRemoval(sparsity) {
  }




  update() {
    this.closed.forEach( tile => {
      tile.update();
    });
  }

  draw() {
    this.closed.forEach( tile => {
      tile.draw();
      //draw border
      tile.drawOutline();
    });
  }
}


//Curve factories
ccrad = closedCurveFactory(2,6,-1,4,7,8,1000);
rectRad = rectRadialFactory(100,100);

//parametric closed curve initialization
c1 = new curve(new point(width/5,height/2),ccrad,ctx);
c1.setScale(2);

//rectangle curve
//r1 = new curve(new point(width/5,height/2),rectRad,ctx);

//construct hex and squares to reference constrcutors for
//grid function
dummyhex = new hex(new point(-5000,-5000),0,ctx);
dummySquare = new square(new point(-5000,-5000),0,ctx);
dummyWater = new waterTile();

hexCon = dummyhex.constructor;
squareCon = dummySquare.constructor;
waterCon =  dummyWater.constructor;

//Make a a grid of hexes (with hex constructor)
//that is bound by the closed curve c1.
let sparsity = Math.random()*5 / 10;
hg = new grid(c1,hexCon,60,ctx);
//random removal
//hg.randomRemoval(sparsity);
//hg = new grid(c1,squareCon,25,ctx);

//for each tile in the grid assign it a grassTile type
hg.closed.forEach( hex => { hex.tile = new grassTile();});
console.log("hg closed");
console.log(hg.closed);


hg.randomTileSwap(.85,waterCon);

/////////////////////////////
//Initialize a batch of cows
/////////////////////////////

cows = [];
numCows  = 10;
for (let i = 0; i < numCows; i++) {
  //pick random unoccupied spots
  let index = 0;
  let unoc = false;
  let debug = 0;
  while (!unoc) {
    index = Math.floor(Math.random()*hg.closed.length);
    if (hg.closed[index].occupant == null) {
      unoc = true;
    }
    debug++;

    if (numCows > hg.closed.length) {
      console.warn("not enough tiles for requested cows");
    }
  }
  console.log("yay cow");
  /*
  let r = Math.random()*255;
  let g = Math.random()*255;
  let b = Math.random()*255;
  */

  //intense colors
  let r = Math.random()*125;
  let g = Math.random()*125;
  let b = Math.random()*125;


  let happyCow = new cow(hg.closed[index],25,'rgb('+r+','+g+','+b+')',ctx); 
  happyCow.node.occupant = happyCow;
  cows.push(happyCow);
}

console.log(cows);



/////////////////////////////////
//Update loop for cows and tiles
/////////////////////////////////

let updateTiles = function () {console.log("clear all"); ctx.clearRect(0,0,width,height); hg.update(); hg.draw(); cows.forEach( cw => {
  cw.update();
  cw.draw();

  //ctx.fillRect(100,100,10,10);

  //ctx.fillRect(800,800,10,10);

});};



//setInterval(updateTiles,2000);
setInterval(updateTiles,500);

//Check if the click hits the bounding area of a cow, to pull up information
//about that cow.
canvas.addEventListener('click', function(event) {
  //console.log(event.offsetX," ",event.offsetY);
  //draw a rect where the click is 
  ctx.fillRect(event.offsetX,event.offsetY,10,10);

  //check where the click is
  cows.forEach( cw => {
    //determine if the click is inside the path of the cows bounding curve
    if (ctx.isPointInPath(cw.path, event.offsetX,event.offsetY)) 
      {
        console.log("a cow was clicked", cw);
        ctx.stroke(cw.path);
      }
  });
});

console.log(canvas);



