//Hook into the DOM
const AspectRatio = { x : 16 , y : 9 };

const leftPane = document.querySelector('#leftPane');
const rightPane = document.querySelector('#rightPane');
const entityBirdEyePane = document.querySelector('#entityBirdEyePane');
const entityStatPane = document.querySelector('#entityStatPane');
const entityStatList = document.querySelector('#statList');
const entityGenePane = document.querySelector('#entityGenePane');

const cowCanvas = document.querySelector('#cowCanvas');
const mapCanvas = document.querySelector('#mapCanvas');
const entityBirdEyeCanvas = document.querySelector('#entityBirdEyeCanvas');
const entityGeneCanvas = document.querySelector('#entityGeneCanvas');

const cowCtx = cowCanvas.getContext('2d'); 
const mapCtx = mapCanvas.getContext('2d'); 
const entityBirdEyeCtx = entityBirdEyeCanvas.getContext('2d');
const entityGeneCtx = entityGeneCanvas.getContext('2d');

const speedSlider = document.querySelector('#speedSlider');

var tileMap =   [];
var cows =      [];
var graveyard = []
var count     = 30;//75;
var inspectedCow = null;
var statMap  = new Map();
var terrainWidth = 800;
var terrainHeight = 400;
var terrainX = 100;
var terrainY = 100;
var polyType = 6;
var tileArea = 720*(1);


const maxFillRecursion = 75;
// Recurison of 88 , yielded 14255 tiles , and took about 20 seconds to calculate
/*  with terrainDim = (800,800)
 *  with terrainOr  = (200,200)
 *  with polyType   = 6
 *  with tileArea = 720*(1/16)
 *  88 fill recursion reached
 *  52000, i.e. 52 seconds of map filling
 *
 *  with same but 720*(1/8)
 *  62 recursion , and 13 seconds
 */

console.log(tileMap);


let img = document.getElementById("cowsprites");

//const tick = 500;     //simulation time step in ms
let tick = 500;
const animFrames = 8; //animation frames render between updates

//Map of Canvases used
let cans = [   { name: 'map'   , can : mapCanvas          , con: leftPane },
               { name: 'cow'   , can : cowCanvas          , con: leftPane },
               { name: 'bird'  , can : entityBirdEyeCanvas, con: entityBirdEyePane },
               { name: 'gene'  , can : entityGeneCanvas   , con: entityGenePane }
           ]

//set up logic for slider input

/*
speedSlider.oninput = function() {
  //console.log(speedSlider.value);
  tick = speedSlider.value;
  console.log(tick);
}
*/

/* Resize each canvas to adhere to the Aspect Ratio */
let adjustGraphics = function() {

  console.log("Resizing Canvases for client");

  console.log("Initial canvases");
  cans.forEach ( c => {
    console.log("canvas : " + c.name  + " width : "  + c.can.width + " height :" + c.can.height);
  });

  cans.forEach( c => {

    let nearestRes = { x : AspectRatio.x , y : AspectRatio.y };
    let maxed = false;
    while ( nearestRes.x < c.con.offsetWidth && nearestRes.y < c.con.offsetHeight ) {
      nearestRes.x += AspectRatio.x;
      nearestRes.y += AspectRatio.y;
    }
    nearestRes.x -= AspectRatio.x;
    nearestRes.y -= AspectRatio.y;
    /*
    console.log("nearest res");
    console.log(nearestRes);
    */
    //adjust logical canvas dimensions
    c.can.width  = nearestRes.x;
    c.can.height = nearestRes.y;
    //adjust canvas style to have a 1:1 mapping to client to logical representation
    c.can.style.width = nearestRes.x;
    c.can.style.height = nearestRes.y;


  });

  console.log("resized canvases");
  cans.forEach ( c => {
    console.log("canvas : " + c.name  + " width : "  + c.can.width + " height :" + c.can.height);
  });


  //construct the simulation
  //adjust terrain values before build
  terrainWidth = mapCanvas.width*(18/20);
  terrainHeight = mapCanvas.height*(18/20);
  terrainX = terrainWidth/20;
  terrainY = terrainHeight/20;

  buildTileMap();
  applyTerrain();
  buildCows(count);
  start();


}

document.addEventListener("DOMContentLoaded", adjustGraphics);


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

//take in two points (as vectors)
//return angle between them
function vecAngle(p1v,p2v) {
  let dot = (p1v.x * p2v.x) + (p1v.y * p2v.y);
  let p1n = Math.sqrt ( p1v.x * p1v.x + p1v.y * p1v.y)
  let p2n = Math.sqrt ( p2v.x * p2v.x + p2v.y * p2v.y)
  let ang = Math.acos( dot / (p1n*p2n) );
  return ang;
}


/////////////////////////
// Map Generation
// //////////////////////

class Tile {
  constructor(cp,n,area,rotOff = 0,type) {
    this.cp = cp;
    this.n = n;
    this.area = area;
    this.sideL = Math.abs(2*Math.sqrt( this.area * Math.tan(Math.PI/this.n) / this.n));
    this.radius = this.sideL / (2*(Math.sin( Math.PI / this.n ) ) );
    this.apothem = this.radius * Math.cos(Math.PI/this.n);
    this.rotOff = rotOff;
    this.type = type;
    this.neighbors = [];
    this.occupant = null;
    //set Tile's canvas it is it's own layer
    this.ctx = mapCtx;
    this.needsRedraw = true;
    //set initial path for drawing
    //needs to be rerender if tile moves
    this.renderPath();
  }

  //draw the outline of the tile
  draw() {
   this.ctx.stroke(this.path);
   if ( this.type != null ) {
     this.ctx.save();
     this.ctx.fillStyle = this.type.color;
     this.ctx.fill(this.path);
     this.ctx.restore();
   
     //why?
     if (this.type.harvestLevel > 60) {
       this.ctx.save();
       this.ctx.fillStyle = 'rgb(255,255,0)';
       this.ctx.restore();
     }
   }
  }

  update() {
    if ( this.type != null ) {
      let currentColor = this.type.color;
      this.type.update();
      if (this.needsRedraw) {
        this.draw();
      }
      this.needsRedraw = (this.currentColor != this.type.color);
    }
  }

  renderPath() {

    let path = new Path2D();
    let vertices = [];
    for ( let i = 0; i < this.n; i++) {
      let theta = (2*Math.PI*i/this.n) + this.rotOff;
      let vx = this.cp.x + this.radius*Math.cos(theta);
      let vy = this.cp.y + this.radius*Math.sin(theta);
      vertices.push([vx,vy]);
    }
    
    path.moveTo(vertices[0][0],vertices[0][1]); 
    for ( let i = 1; i < this.n; i++) {
      path.lineTo(vertices[i][0],vertices[i][1]);
    }
    path.lineTo(vertices[0][0],vertices[0][1]);
    this.path = path;
  }

  //ad hoc tests
  identify() {
    this.ctx.fillRect(this.cp.x,this.cp.y,10,10);
    this.neighbors.forEach( t => {
      this.ctx.fillRect(t.cp.x,t.cp.y,10,10);
    });
  }
}


//////////////////////////
// Terrain              //
//////////////////////////

//64 phases of growth
 const grain = [ '#884B11' , '#854C11' , '#834E11' , '#815011' ,
                 '#7F5211' , '#7D5412' , '#7B5612' , '#785712' ,
                 '#765912' , '#745B13' , '#725D13' , '#705F13' ,
                 '#6E6113' , '#6B6213' , '#696414' , '#676614' ,
                 '#656814' , '#636A14' , '#616C15' , '#5E6D15' , 
                 '#5C6F15' , '#5A7115' , '#587315' , '#567516' ,
                 '#547716' , '#527916' , '#4F7A16' , '#4D7C17' ,
                 '#4B7E17' , '#498017' , '#478217' , '#458417' ,
                 '#428518' , '#408718' , '#3E8918' , '#3C8B18' , 
                 '#3A8D19' , '#388F19' , '#359019' , '#339219' ,
                 '#319419' , '#2F961A' , '#2D981A' , '#2B9A1A' , 
                 '#299C1A' , '#269D1B' , '#249F1B' , '#22A11B' , 
                 '#20A31B' , '#1EA51B' , '#1CA71C' , '#19A81C' , 
                 '#17AA1C' , '#15AC1C' , '#13AE1D' , '#11B01D' , 
                 '#0FB21D' , '#0CB31D' , '#0AB51D' , '#08B71E' ,
                 '#06B91E' , '#04BB1E' , '#02BD1E' , '#00BF1F'   ];

class Grass {

  constructor(t=5,hl=15,hr=.1,hm=100,hd = 1, com = 1) {
    this.traversability =  t; 
    this.harvestLevel   =  hl; 
    this.harvestRate    =  hr; 
    this.harvestMax     =  hm;
    this.hydration      =  hd;
    this.comfort        =  com;
    this.kind = "grass";
  }

  update() {
    //grass tile
    if (this.harvestLevel < this.harvestMax) {
      this.harvestLevel += this.harvestRate;
    }
    if (this.harvestLevel > this.harvestMax) {
      this.harvestLevel = this.harvestMax;
    }
    this.color = grain[Math.ceil( (this.harvestLevel / this.harvestMax)*grain.length )];
  }
}

class Water {

  constructor(t,hl,hr,hm,hd,com = 1) {
    this.traversability =  t; 
    this.harvestLevel   =  hl; 
    this.harvestRate    =  hr; 
    this.harvestMax     =  hm;
    this.hydration      =  hd;
    this.comfort        =  com;
    this.kind = "water";

    //depth derived from traversability
    this.depth = this.traversability;

    this.color = "rgb(0,0," + (255 - Math.floor(this.depth * 100)) + ")";
  }

  update() {
    //NA static tile
  }
}

//No hydration , no energy , high traversal cost
class Rock {
  constructor(t,hl,hr,hm) {
    this.traversability = t; //1 < t < 100 How hard is it to get to this tile
    this.harvestLevel   = hl; //what resources are currently available to consume
    this.harvestRate    = hr; //How quickly resources regenerate
    this.harvestMax     = hm;
    this.hydration      =  1;
    this.comfort        =  1;
    this.kind = "rock";
    this.color = "gray";

    //depth derived from traversability
    this.height = this.traversability;
    let grayLevel = 155 - Math.floor( this.height * 100);
    this.color = "rgb(" + grayLevel + "," + grayLevel + "," + grayLevel + ")";
  }

  update() {
    //NA static tile
  }
}

////////////////////////////
//Inhabitants
////////////////////////////

const energyBase = 1000;
const hungerBase = 1000;
const emotionBase = 1000;
const hydrationBase = 1000;
//Cows are doubly referenced between cow and tile
class cow {
  constructor(tile,env,size,color,name,genes) {
    // 1. size should be reworked/ repurposed
    // 2. color currently has no affect

    //graphics context
    this.ctx = cowCtx;

    ////////////////////////
    //genetic attributes
    ////////////////////////
    //
    this.genes = genes;

    this.absorption      = this.genes.get('absorption');    //impact hydration cap
    this.agility         = this.genes.get('agility');    //ease of traversal
    this.desiribility    = this.genes.get('desiribility');    //likelihood of mating
    this.endurance       = this.genes.get('endurance');    //impact energy cap
    this.hermitic        = this.genes.get('hermitic');    //desire to avoid others
    this.hostility       = this.genes.get('hostility');    //likelihood of attacking others
    this.metabolicEff    = this.genes.get('metabolicEff');    //easge of digestion
    this.mindfullness    = this.genes.get('mindfullness');    //impact emotion cap
    this.nomadicity      = this.genes.get('nomadicity');   //desire to migrate
    this.satiation       = this.genes.get('satiation');    //impact hunger cap
    this.urgency         = this.genes.get('urgency');    //desire to mate

    ///////////////////////////
    //Model variables
    ///////////////////////////

    this.alive = true;
    this.tile = tile; //tile im located at all
    this.env  = env;  //list of all tiles in the universe
    this.size = size;
    this.color = color;
    this.name = name;

    this.energyCap = energyBase * this.endurance;  
    this.hungerCap = hungerBase * this.satiation;
    this.emotionCap = emotionBase * this.mindfullness;
    this.hydrationCap = hydrationBase * this.absorption;

    this.energy = this.energyCap; //physical health
    this.hunger = this.hungerCap; //energy in the body
    this.emotion = this.emotionCap; //social satisfaction 
    // on social : nomads lose emotion when stuck in the same place
    //           : hermits lose emotion when stuck with others
    this.hydration = this.hydrationCap;


    //////////////////////
    //audit
    /////////////////////

    this.actionLog = [];
    this.energyRestored = 0;
    this.hungerRestored = 0;
    this.hydrationRestored = 0;
    this.tilesTraveled = 0;
    this.ticks = 0;
    this.causeOfDeath = null;

    this.previousTile = null;  //what tile the cow is heading to

    this.stateTicks = 0; //what point we are in the current state
                         //cycles between 0 to this.stateCap
    
    this.stateCap   = 0; //how many ticks the current state will last

    this.state = "idle"; //the current state

    this.animTicks = 0; //what phase of animation we are in
    this.animCap = 4;   //how many frames the animation has
    this.framesPerUpdate = 4;

    this.boundingPath = null;

    ////////////////////////////
    //debug properties
    ////////////////////////////
    this.debug = false;
  }

  //change the animation frame
  //and draw to the canvas
  animate() {

    let sprWidth  = 128/4;
    let sprHeight = 160/5;

    //where to place sprites so they are centered at
    //our tiles center point
    let centeredx = this.tile.cp.x - sprWidth/2;
    let centeredy = this.tile.cp.y - sprHeight/2;
    
    //source origin
    let sx = 0;
    let sy = 0;

    //destination origin
    let dx = centeredx;
    let dy = centeredy;

    //orientation of canvas context,
    //when sprites need to be flipped, we must 
    //negate some axis -> see west facing condition
    let scaleX = 1;
    let scaleY = 1;

    let flip = false;

    let stateText = "oops something is wrong";

    ///////////////////////////////
    // Calculate animation state
    ///////////////////////////////

    let totalTicks = this.stateCap * animFrames;
    //if the animation loop requests less frames than
    //the entire animation requires, we sub sample the frames
    //and adjust our total ticks to account for this when we 
    //traverse the line between the source and target
    if (animFrames < this.animCap) {
      totalTicks = this.stateCap * animFrames;
    }

    let currentTick = (this.stateTicks * animFrames) + this.animTicks;

    if (this.debug) {
      console.log("stateTick : ", this.stateTicks);
      console.log("stateCap : ", this.stateCap);
      console.log("animTick : ", this.animTicks);
      console.log("animTick % animCap : " , this.animTicks % this.animCap);
      console.log("animCap : ", this.animCap);
      console.log("animFrames : ", animFrames);
      console.log("current tick : " , currentTick);
      console.log("total ticks : " , totalTicks);
      console.warn("----------------------------");
    }



    if (this.state == "move") {

       stateText = "kyyyYAaa";
      //move centeredx and centerdy such that the correspond to a point
      //on the line between where we are moving. The line is discretized
      //by anim ticks with a length of (stateTicks * animCap)
      let moveVector = this.tile.cp.sub(this.previousTile.cp);

      dx = this.previousTile.cp.x + (currentTick/totalTicks)*moveVector.x - sprWidth/2;
      dy = this.previousTile.cp.y + (currentTick/totalTicks)*moveVector.y - sprHeight/2;

      //calculate the cardinal direction i am facing
      
      let dirVec = new point(this.tile.cp.x - this.previousTile.cp.x ,this.tile.cp.y - this.previousTile.cp.y)
      let facing = null;
    
      let angleDirs = [];
      angleDirs.push({ dir: "north" , dist : vecAngle(dirVec,new point(0,-1)) } ); //north
      angleDirs.push({ dir: "east" , dist : vecAngle(dirVec,new point(1,0)) } ); //east
      angleDirs.push({ dir: "south" , dist : vecAngle(dirVec,new point(0,1)) } ); //south
      angleDirs.push({ dir: "west" , dist : vecAngle(dirVec,new point(-1,0)) } ); //west

      let closest = 0;
      for ( let i = 0; i < angleDirs.length; i++ ) {
        if (angleDirs[i].dist < angleDirs[closest].dist) {
          closest = i;
        }
      }
      facing = angleDirs[closest].dir;

      //determine direction and adjust sprite indices accordingly
      //at the same time find parameters that will illustrate
      //the direction moved confined to N E S W

      sx = (this.animTicks % this.animCap)*sprWidth;

      if ( facing == "north" ) {
        sy = sprHeight * 2;
      } else if ( facing == "east" ) {
        sy = sprHeight * 1;
      } else if ( facing == "south") {
        sy = sprHeight * 0;
      } else {
        sy = sprHeight * 1;
        scaleX = -1;
        //adjust dx for flipped scale
        dx = -dx - sprWidth;
      }

    } else if (this.state == "idle") {
      // 3 x [ 0 1 ]
      sx = (this.animTicks % this.animCap) * sprWidth;
      sy = 3 * sprHeight;

      stateText = "MoooOOooo";

    } else if (this.state == "eat") {
      // 4 x [ 0 1 ]
      sx = (this.animTicks % this.animCap) * sprWidth;
      sy = 4 * sprHeight;

      stateText = "munch munch";

    } else if (this.state == "rest") {
      // 4 x [ 2 3 ]
      sx = ( (this.animTicks % this.animCap) + 2)*sprWidth;
      sy = 4 * sprHeight;

      stateText = "zzZzzZzzZ";

    } else if (this.state == "drink") {
      // 4 x [ 2 3 ]
      sx = ((this.animTicks % this.animCap) + 2) * sprWidth;
      sy = 4 * sprHeight;

      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      stateText = "sLuuuuRp";
    }

    //draw sprites with calculated indices
    this.ctx.save();
    this.ctx.scale(scaleX,scaleY);
    this.ctx.drawImage(cowsprites,sx,sy,sprWidth,sprHeight,dx,dy,sprWidth,sprHeight);

    //update the bounding path of the cow
    this.boundingPath = new Path2D();
    this.boundingPath.arc(dx+sprWidth/2,dy+sprHeight/2,this.size,0,2*Math.PI); 
    this.ctx.stroke(this.boundingPath);

    /*
    //apply a hue of this cow's color to the drawn image
    //works but also hues the white pixels which we want to ignore
    //can i only apply hue to pixels with non-zero alpha value?
    this.ctx.globalCompositeOperation = "hue";
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(dx,dy,sprWidth,sprHeight);
    this.ctx.globalCompositionOperation = "source-over";
    this.ctx.restore();
    */
    this.ctx.restore();


    //info bars
    this.ctx.fillStyle = "green";
    this.ctx.fillRect(dx,dy,(this.energy/this.energyCap)*this.size*2,5);
    this.ctx.strokeRect(dx,dy,this.size*2,5);

    this.ctx.fillStyle = "orange";
    this.ctx.fillRect(dx,dy - this.size*.25,(this.hunger/this.hungerCap)*this.size*2,5);
    this.ctx.strokeRect(dx,dy - this.size*.25,this.size*2,5);

    this.ctx.fillStyle = "yellow";
    this.ctx.fillRect(dx, dy - this.size*.5,(this.emotion/this.emotionCap)*this.size*2,5);
    this.ctx.strokeRect(dx, dy - this.size*.5,this.size*2,5);

    this.ctx.fillStyle = "blue";
    this.ctx.fillRect(dx,dy - this.size*.75,(this.hydration/this.hydrationCap)*this.size*2,5);
    this.ctx.strokeRect(dx,dy - this.size*.75,this.size*2,5);

    //name bar
    this.ctx.fillStyle = "black";
    this.ctx.font = '20px monospace';
    this.ctx.fillText(this.name ,dx,dy - this.size*1.5);

    //animation bar
    this.ctx.fillStyle = "red";
    this.ctx.font = '12px monospace';
    this.ctx.fillText(stateText,dx,dy - this.size);

    //update animation state
    //if animCap < animFrames , we duplicate the animation
    //if animCap > animFrames , we truncate the animation
    this.animTicks = (this.animTicks + 1) % animFrames;
  }

  //consider th state and the environmnet, what action will I take
  //Idle , Rest, Fight, Fuck, Eat, Move
  //simple subset , Idle, Rest, Eat , Move
  imperative() {
    this.ticks++;

    //what actions are physically possible

    let idle = 1;
    let rest = 1;
    let eat =  1;
    let move = 1;
    let drink = 1;

    //can I sleep?
    
    if (this.tile.type == null) {
      console.log("this tile below has null type");
      console.log(this.tile);
      let i = 0;
      let index = 0; 
      this.env.forEach( c => {
        if ( c.cp.x == this.tile.cp.x ) {
          console.log("found");
          index = i;
        }
        i++;
      });
      console.log("located at");
      console.log(index);
      console.log("mtk");
    }
    if ( this.tile.type.comfort == 0 ) {
      rest = 0;
    }

    //can I move?
    let vacancy = this.tile.neighbors.filter( n => {
      if (n.occupant == null) {
        return true;
      } 
      return false;
    }).length;

    //No if no space, or insufficient energy
    //10 should be replaced with a flat move cost minimum
    if (vacancy == 0 || this.energy < 10) {
      move = 0;
    }
 
    if (this.hunger >= this.hungerCap) {
      eat = 0;
    }

    //Can I drink ?
    if (this.hydration >= this.hydrationCap ||
        this.tile.hydration == 0) {
      drink = 0;
    }

    //assign raw scores for each action that is valid
    if (rest != 0) {
      //set rest score
      //energy depletion gives a scale of 100 votes
      let depleteFactor = 100*((this.energyCap - this.energy)/this.energyCap);
      rest = depleteFactor;
    }
    if (eat  != 0) {
      //set eat score
      let hungerFactor = 100*((this.hungerCap - this.hunger)/this.hungerCap);
      eat = hungerFactor;
    }
    if (move != 0) {
      //set move score
      //nomadicty gets a scale of 40 votes
      let nomadicFactor = 50 * this.nomadicity;
      move = nomadicFactor;
    }


    if (drink != 0) {
      //set drink score
      drink = 100*((this.hydrationCap - this.hydration)/this.hydrationCap);
    }


    //normalize votes
    let total_score = move + eat + rest + drink + idle;
    move = move/total_score;
    eat  = eat/total_score;
    rest = rest/total_score;
    drink = drink/total_score
    idle  = idle/total_score;

    //pick action
    let chance = Math.random();
    let choice = null;

    if ( chance < move) {
      choice = "move"; 
    } else if ( chance < move + eat) {
      choice = "eat";
    } else if (chance < move + eat + rest){
      choice = "rest";
    } else if (chance < move + eat + rest + drink){
      choice = "drink";
    } else {
      choice = "idle";
    }
    return choice;
  }

  //precondition moves are available
  move() {
      let moves = []
      this.tile.neighbors.forEach( n => {
        if ( n.occupant == null ) {
          moves.push(n);
        }
      });

      let dir = Math.floor( Math.random() * moves.length);
      //store mmy current tile
      this.previousTile = this.tile;
      //let tile know I left
      this.tile.occupant = null;

      //remind myself where I am
      this.tile = moves[dir];

      //10 would be max travel cost 
      //and is discounted by traversability and cows endurance
      //cap endurant discount at .05, means that .95 -> 1 has no difference ...
      this.energy -= this.tile.type.traversability*10*( Math.max((1-this.agility),.05) );
      //let tile now I'm here
      this.tile.occupant = this;

      //update audit
      this.tilesTraveled++;

      //state housekeeping
      this.state = "move";
      this.stateTicks = 0;
      this.stateCap = 4;
      //anim housekeeping
      this.animTicks = 0;
      this.animCap = 4;

  }

  rest() {
    if (this.energy < this.energyCap) {
      //10 is base
      let energyBack = 10 * (this.tile.type.comfort);
      if (this.energyCap < this.energy + energyBack) {
        energyBack -= ( this.energy + energyBack - this.energyCap);
      }
      this.energy+=energyBack;

      //audit
      this.energyRestored += energyBack;

      //state housekeeping
      this.state = "rest";
      this.stateTicks = 0;
      this.stateCap = 8;
      //anim housekeeping
      this.animTicks = 0;
      this.animCap = 2;
    }
  }

  consume() {
    if ( this.tile.type.harvestLevel != 0) {
      //Defecit
      let meal = 15;
      if ( meal > this.tile.type.harvestLevel ) {
        meal = this.tile.type.harvestLevel;
      }
  
      if (this.hungerCap - (this.hunger + meal) < 0) {
        meal = (this.hunger + meal - this.hungerCap);
      }

      this.hunger += meal;
      this.tile.type.harvestLevel -= meal;

      //audit
      this.hungerRestored += meal;

      //state housekeeping
      this.state = "eat";
      this.stateTicks = 0;
      this.stateCap = 4;
      //anim housekeeping
      this.animTicks = 0;
      this.animCap = 2;
    }
  }

  idle() {
    //state housekeeping
    this.state = "idle";
    this.stateTicks = 0;
    this.stateCap = 2;
    //anim housekeeping
    this.animTicks = 0;
    this.animCap = 2;
  }


  drink() {
    if ( this.tile.type.hydration != 0) {
      let sipBase = 8;
      let sip = sipBase * this.tile.type.hydration;
      if (this.hydration + sip > this.hydrationCap ) {
        sip = this.hydration + sip - this.hydrationCap;
      }
      this.hydration += sip;
      //audit
      this.hydrationRestored += sip;

      //state housekeeping
      this.state = "drink";
      this.stateTicks = 0;
      this.stateCap = 2;
      //anim housekeeping
      this.animTicks = 0;
      this.animCap = 2;

    }
  }


  update() {

    if (!this.alive) {
      return
    }

    this.ticks++;
    if (this.stateTicks != this.stateCap) {
      this.stateTicks++;
    } 

    //only change state of current state is finished
    if (this.stateTicks == this.stateCap) {

      let action = this.imperative();
      //console.log(this.name + " " + action);
      if (action == "eat") {
        this.consume();  
        this.actionLog.push("eat");
      } else if ( action == "rest" ) {
        this.rest();
        this.actionLog.push("rest");
      } else if ( action == "move" ) {
        this.move();
        this.actionLog.push("move");
      } else if ( action == "drink" ) {
        this.drink();
        this.actionLog.push("drink");
      } else if ( action == "idle") {
        this.idle();
        this.actionLog.push("idle");
      }
    }

    // TODO
    //Biological consequences should be affected by the environment


    //Biological consequences

    //Ever update hunger is depleted.
    this.hunger--;
    this.energy--;
    this.hydration--;

    // if hunger is severly low , energy is affected more drastically
    let hungerSeverity = 5 - Math.floor( (this.hunger / this.hungerCap)*10);
    //every 10 percentage energy loss below 5, results in n times more energy depleted.
    if ( hungerSeverity > 0) {
      this.energy -= hungerSeverity;
    }

    //////////////////////
    //Death conditions
    //////////////////////

    //Hunger
    if (this.hunger <= 0) {
        this.alive = false;
        this.causeOfDeath = "Starvation";
    }
    //general life force
    if (this.energy <= 0) {
        this.alive = false;
        this.causeOfDeath = "Collapse";
    }
    //Hydration
    if (this.hydration <= 0){
        this.alive = false;
        this.causeOfDeath = "Dehydration";
    }

    ///////////////
    //Death
    ///////////////

    if (!this.alive) {
      this.tile.occupant = null;
     
      console.log(this.name + " has passed ");
      /*
      console.log("Actions");
      console.log(this.actionLog);

      console.log("Energy Restored : " + this.energyRestored);
      console.log("Hunger Restored : " + this.hungerRestored);
      console.log("Hydration Restored : " + this.hydrationRestored);
      console.log("Tiles Traveled : " + this.tilesTraveled);
      console.log("Ticks : " + this.ticks);
      console.log("Cause of Death : " + this.causeOfDeath);
      */
    }
  }
}



////////////////////////////////////
//World Building
////////////////////////////////////


//take a list of tiles, a list of tiles, and a bounding rectangle,
//with a limit counter, and tile the rectangular domain with adjacent
//tiles : only applies to tiles of degree 3 , 4 , or 6
//return  list of list where the closed has a connected set of tiles
//Note ! note not torudal
function fill(frontier,closed,width,height,x,y,debug=0) {

  if (frontier.length == 0 || debug == maxFillRecursion) {
    console.log("frontier closed");
    console.log("Recursion level reached " , debug);
    if ( frontier.length != 0 ) {
      console.log("search aborted");
    }
    return [frontier,closed];
  } else {

    //retrieve a prototype from the frontier learn about tiling
    //to be performed.
    let proto = frontier[0];
    //ensure a valid degree of tile is the prototype
    if (proto.n != 3 && proto.n !=4 && proto.n != 6) {
      console.warn("fill function is only applicable to Tile with degrees 3,4 or 6");
      return [];
    }

    let newFrontier = [];
    //get all neighboring center points that fall within the bounds 
    //of landscape rectangle
    frontier.forEach( tile => {
      //get all neighboring center points that fall within the bounds 
      //of landscape rectangle
      //compute neighboring tiles based on the n and a
      //new cp of adjacecent tiling will be 2 radius of proto tile's polygon.
      
      for ( let i = 0; i < proto.n; i++ ) {
        let internalOffset = Math.PI/proto.n;
        let theta = (2*Math.PI*i/proto.n) + tile.rotOff + internalOffset;
        //console.log(internalOffset);
        /*
        if ( proto.n == 3 ) {
          theta = ( 2*Math.PI*i/proto.n) + tile.rotOff + internalOffset;
        }
        */

        let vx = tile.cp.x + 2*tile.apothem*Math.cos(theta); 
        let vy = tile.cp.y + 2*tile.apothem*Math.sin(theta);

        //console.log(vx,vy);
        //only consider centerpoints that fall within bounding rectangle
        if ( vx >= x && vx <= x + width && vy >= y && vy <= y + height) {
          //console.log("passing landscape boundary check");
          //only consider potential tiles that are not already in the closed,
          //or in the new frontier
          let vxy = new point(vx,vy);

          let overlap = false;

          //check for existence in the closed
          let closedIndex = -1;
          for ( let j = 0; j < closed.length; j++) {
            if ( closed[j].cp.equals(vxy) ) {
              closedIndex = j;
            }
            if (Math.abs(closed[j].cp.sub(vxy)) < 2*tile.apothem) {
              overlap = true;
            }
          }
          //check for existence in new frontier
          let newFrontierIndex = -1;
          for ( let j = 0; j < newFrontier.length; j++) {
            if ( newFrontier[j].cp.equals(vxy) ) {
              newFrontierIndex = j;
            }
            if (Math.abs(newFrontier[j].cp.sub(vxy)) < 2*tile.apothem) {
              overlap = true;
            }
          }

          //check for existence in current frontier
          let frontierIndex = -1;
          for ( let j = 0; j < frontier.length; j++) {
            if ( frontier[j].cp.equals(vxy) ) {
              frontierIndex = j;
            }
            if (Math.abs(frontier[j].cp.sub(vxy)) < 2*tile.apothem) {
              overlap = true;
            }
          }

          if ( closedIndex == -1 && 
               newFrontierIndex == -1 &&
               frontierIndex == -1    &&
               !overlap) {

               //need to add adjacency (linking to new tiles tbd);
               //let newTile = new Tile(vxy,proto.n,proto.area,theta,null);
               //adjust new offset for triangular tiles, otherwise for squares and rectangles
               //offset is just propagated.
               let newRotOff = theta;
               if ( tile.n != 3 ) {
                 newRotOff = tile.rotOff;
               }
               let newTile = new Tile(vxy,proto.n,proto.area,newRotOff,null);
               tile.neighbors.push(newTile);
               newTile.neighbors.push(tile);
               newFrontier.push(newTile);
               //ctx.fillRect(vx,vy,10*debug,10*debug);
               //ctx.fillRect(vx,vy,10,10);
          } else if (frontierIndex != -1)  {
            //link the tile we branch from with the found tile in the current frontier
            //it already exists but has incomplete neighbor data
            let foundButNotConnected = frontier[frontierIndex];
            tile.neighbors.push(foundButNotConnected);
            foundButNotConnected.neighbors.push(tile);
          } else if (newFrontierIndex != -1) {
            let foundButNotConnected = newFrontier[newFrontierIndex];
            tile.neighbors.push(foundButNotConnected);
            foundButNotConnected.neighbors.push(tile);
          }

        }
      }

    });

      //end of prospecting
      frontier.forEach( tile => {
        closed.push(tile);
      });
      debug++;
      return fill(newFrontier,closed,width,height,x,y,debug);
  }
}


//////////////////////
// Cow instanatiation
//////////////////////

const names = [ "spark" , "cherry" , "plop", "ting" , "rocky", "spuck",
                "wop"   , "slop"   , "pog" , "glop" , "spur" , "whisp",
                "tuna"  , "gorsh"  , "mil" , "tran" , "sorch", "bash" ,
                "grass" , "rock" , "fire" , "light" , "wet"  , "twig" ,
                "plain" , "valley" , "hill" , "beach" , "dry" , "mad" ,
                "bertha", "bessie" , "bussy", "helen" , "karen", "sagar"];


function makeCow(tile,env) {

    let r = Math.random()*100 + 155;
    let g = Math.random()*100 + 155;
    let b = Math.random()*100 + 155;
    let color = "rgb(" + r + "," + g + "," + b +")";
    let name = names[Math.floor(Math.random()*names.length)];

    let genes = new Map();
    genes.set( 'absorption'      , Math.random()  );    //impact hydration cap
    genes.set( 'agility'         , Math.random()  );    //ease of traversal
    genes.set( 'desiribility'    , Math.random()  );    //likelihood of mating
    genes.set( 'endurance'       , Math.random()  );    //impact energy cap
    genes.set( 'hermitic'        , Math.random()  );    //desire to avoid others
    genes.set( 'hostility'       , Math.random()  );    //likelihood of attacking others
    genes.set( 'metabolicEff'    , Math.random()  );    //easge of digestion
    genes.set( 'mindfullness'    , Math.random()  );    //impact emotion cap
    genes.set( 'nomadicity'      , Math.random()  );    //desire to migrate
    genes.set( 'satiation'       , Math.random()  );    //impact hunger cap
    genes.set( 'urgency'         , Math.random()  );    //desire to mate
    return new cow(tile,env,20,color,name,genes);
}


////////////////////////////////////
/// Construction Start            //
////////////////////////////////////


/* Modify tileMap , graveYard , cows, inspectedCow */
function buildTileMap() {

  console.log("Building Simulation");

  //Construct a world boundary and fill it with tiles.
  //Place the first tile at the center of the terrain dimension
  let cp = new point(terrainX + terrainWidth/2,terrainY + terrainHeight/2);
  //720 x 2  //Math.PI/2
  let tt = new Tile(cp,polyType,tileArea,Math.PI/2,null);
  //tt.type = new Grass(.2,30,.02,100,.3,.5);

  //fill out boundary with tiles
  let frontier = [];
  //reset global tile map
  tileMap = [];
  //seed frontier
  frontier.push(tt);
  //fill out the tileMap
  //Log time elapsed
  console.time('FillingMap');
  [frontier,tileMap] = fill(frontier,tileMap,terrainWidth,terrainHeight,terrainX,terrainY);
  console.timeEnd('FillingMap');
  console.log(tileMap);

}


///////////////////////////////
// Apply Terrain to the tiles
///////////////////////////////

function applyTerrain() {


    tileMap.forEach( t => {
      let tv = .2; //traversability
      let hl = Math.random()*30; //harvest level
      let hr = (Math.random()*4)*(.01); //harvest rate
      let hm = 100; //max harvest
      let hd = .2; //hydration
      let com = .4; //comfort
      t.type = new Grass(tv,hl,hr,hm,hd,com);
    });

    //Apply random water tiles
    let wrate = .55
    tileMap.forEach( t => {
      if (Math.random() < wrate) {
        let tv = Math.random()*(.6) + .2; //traversability water can be .2 to .8
        let hl = Math.random()*30; //harvest level
        let hr = (Math.random()*4)*(.01); //harvest rate
        let hm = 100; //max harvest
        let hd = 1; //hydration
        let com = 0; //comfort
        t.type = new Water(tv,hl,hr,hm,hd,com);
      }
    });

    let rrate = .4;
    tileMap.forEach( t => {
      if (Math.random() < rrate) {
        let tv = Math.random()*.3 + .2
        let hl = 0; //harvest level
        let hr = 0; //harvest rate
        let hm = 0; //max harvest
        let hd = 0; //hydration
        let com = .8; //comfort
        t.type = new Rock(tv,hl,hr,hm,hd,com);
      }
    });

    console.log("tile map after mutation");
    console.log(tileMap);
}


function buildCows(count) {

  //reset cows and graveyard
  cows = [];
  graveyard = [];

  for ( let i = 0; i < count; i++ ) {
    //todo apply a hue over the sprite so cows can have unique colors
    /*
    let r = Math.random()*100 + 155;
    let g = Math.random()*100 + 155;
    let b = Math.random()*100 + 155;
    let color = "rgb(" + r + "," + g + "," + b +")";
    let name = names[Math.floor(Math.random()*names.length)];
    */
    let startFound = false;
    while (!startFound) {
      let tileIndex = Math.floor(Math.random()*tileMap.length);
      let tile = tileMap[tileIndex];
      if (tile.occupant == null) {
        startFound = true;
        cows.push(makeCow(tile,tileMap));
      }
    }
  }
  console.log("Cows Produced");
  console.log(cows);

}


////////////////////////////////////
// Update Tiles (Logic and View)  //
////////////////////////////////////
function tilesUpdate() {
    tileMap.forEach( c => {
      c.update();
    });
  }

////////////////////////////////
// Update Cows     (Logical)  //
////////////////////////////////
function cowsUpdate() {
    console.warn("---------Cows update----------------");
    cows.forEach( c => {
      c.update();
    });
    //remove any dead cows
    let dead = [];
    for ( let i = 0; i < cows.length; i++) {
      if (!cows[i].alive) {
        dead.push(i);
        graveyard.push(cows[i]);
      }
    }
    let removed = 0;
    dead.forEach( d => {
      cows.splice(d-removed,1);
      removed++;
    });
  }


////////////////////////////
// Update Stat Pane       //
////////////////////////////


function inspectedStatUpdate() {

    let ins = inspectedCow;

    let dp = function(num) {
      return num.toFixed(4);
    }

    //clear list
    entityStatList.innerHTML = "";

    //add stat to list
    function addStat(st) {
      let li = document.createElement("li");
      li.appendChild(document.createTextNode(st));
      entityStatList.appendChild(li);
    }

    addStat("Name : " + ins.name);
    addStat("Energy : " + dp(ins.energy));
    addStat("Hunger : " + dp(ins.hunger));
    addStat("Emotion : " + dp(ins.emotion));
    addStat("Hydration : " + dp(ins.hydration));
    addStat("--------------");
    addStat("State : " + ins.state);
    addStat("Ticks : " + ins.ticks);
    //change the stat list in the dom

    let index = 0;
    let colors = ['Aqua','Aquamarine','BlueViolet','Brown','Charteuse','Chocolate','Blue',
                  'Crimson','Cyan','DarkOrange','DeepPink','DarkRed','Gold'];
}


/////////////////////////////
//Update Gene Display      //
/////////////////////////////


function inspectedGeneUpdate() {

    let geneMap = inspectedCow.genes;
    // gene display will occupy same width as the bird's eye view
    let barGapRatio = .4;   //ratio of space between bars and the space the bars occupy in x
    let barW = entityGeneCanvas.width * (1-barGapRatio) / geneMap.size;
    let barH = entityGeneCanvas.height * (3/4);


    let index = 0;
    let colors = ['Aqua','Aquamarine','BlueViolet','Brown','Charteuse','Chocolate','Blue',
                  'Crimson','Cyan','DarkOrange','DeepPink','DarkRed','Gold'];

    //clear
    entityGeneCtx.clearRect(0,0,entityGeneCanvas.width,entityGeneCanvas.height);

    geneMap.forEach((value,key) => {
      entityGeneCtx.save();
      entityGeneCtx.fillStyle = colors[index];
      entityGeneCtx.lineWidth = 1;
      entityGeneCtx.fillRect(   (((barGapRatio*barW) + barW) * index) + barW*2,
                                entityGeneCanvas.height,barW,-barH*value);

      entityGeneCtx.strokeRect( (((barGapRatio*barW) + barW) * index) + barW*2,
                                entityGeneCanvas.height,barW,-barH);
      entityGeneCtx.restore();
      index++;
    });
}


///////////////////////
//Update Bird's Eye  //
///////////////////////


function inspectedBirdEyeUpdate() {
  let Icp = inspectedCow.tile.cp;
  //birdW and birdH should be a function of intended zoom
  //we want to confine the space in the cow and map canvas to be strictly less
  //than the space provided in the birdEye Canvas
  let zoom = 2;
  let birdW = entityBirdEyeCanvas.width/zoom;
  let birdH = entityBirdEyeCanvas.height/zoom;

  //draw a 200 by 200 box , scaled to 400 400 with tile.cp at center
  let birdX = Icp.x - birdW/2;
  let birdY = Icp.y - birdH/2;
  let scale = 1;
  entityBirdEyeCtx.save();
  entityBirdEyeCtx.imageSmoothingQuality = "high"; /* makes huge difference here */
  entityBirdEyeCtx.clearRect(0,0,entityBirdEyeCanvas.width,entityBirdEyeCanvas.height);
  entityBirdEyeCtx.drawImage(mapCanvas,birdX,birdY,birdW,birdH,0,0,entityBirdEyeCanvas.width,
                                                                 entityBirdEyeCanvas.height);
  entityBirdEyeCtx.drawImage(cowCanvas,birdX,birdY,birdW,birdH,0,0,entityBirdEyeCanvas.width,
                                                                 entityBirdEyeCanvas.height);
  entityBirdEyeCtx.restore();
}


////////////////////////////////
//update cow animation state  //
////////////////////////////////


function cowAnimation() {
  cowCtx.clearRect(0,0,1920,1080);
  cows.forEach( c => {
    c.animate();
  });
  inspectedBirdEyeUpdate();
}


///////////////////////////////
// Master Update call        //
///////////////////////////////


function updateCall() {
  if ( cows.length == 0 ) {
    clearInterval(id);
    console.log(graveyard);
    //run stats on graveyard
    graveyard.forEach( c => {
      c.actionLog.forEach ( a => {
        if (statMap.has(a)) {
          let old = statMap.get(a);
          statMap.set(a,old+1);
        } else {
          statMap.set(a,1);
        }
      });
    });
    console.log(statMap);
  }

  //previously used landscapeWidth and landscapeheight
  //will change back later when those are global vars
  mapCtx.clearRect(terrainX,terrainY,terrainWidth,terrainHeight);
  mapCtx.strokeRect(terrainX,terrainY,terrainWidth,terrainHeight);
  tilesUpdate();

  for ( let i = 0; i < animFrames; i++) {
    setTimeout(cowAnimation,(tick/animFrames)*i);
  }
  cowsUpdate();
  inspectedGeneUpdate();
  inspectedStatUpdate();

}



function start() {

  //set an inspected cow for the entity pane
  inspectedCow = cows[0];


  /////////////////////////
  //Change selected Cow
  /////////////////////////

  //Check if the click hits the bounding area of a cow, to pull up information
  //about that cow.
  cowCanvas.addEventListener('click', function(event) {
    cowCtx.fillRect(event.offsetX,event.offsetY,10,10);
    //check where the click is
    cows.forEach( cw => {
      //determine if the click is inside the path of the cows bounding curve
      //TODO
      //This may find many cows at once, some order should be set for a well defind
      //selection

      let clickX = event.offsetX;
      let clickY = event.offsetY;
      if (cowCtx.isPointInPath(cw.boundingPath,clickX,clickY))
        {
          console.log("a cow was clicked", cw);
          inspectedCow = cw;
        }
    });
  });

  //In order to manipulate time better, or at all dynamically
  //i need to reconfigure the main loops, if I change tick
  //after setInterval , it's tick is pass by value and does not 
  //update.
  //start the main update call
  let id = setInterval(updateCall,tick);

}






































