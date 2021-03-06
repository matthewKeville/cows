///Hook into the DOM
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
const playRadio  = document.querySelector('#play');
const pauseRadio  = document.querySelector('#pause');

const sliderElements = document.querySelectorAll('.speed');

const fpsInstant = document.querySelector('#fpsInstant');
const fpsAvg     = document.querySelector('#fpsAvg');
const populationDisplay = document.querySelector('#population');

//

var count     = 300;
var terrainWidth =  1000;
var terrainHeight = 800;
var terrainX = 100;
var terrainY = 0;
var polyType = 6;
var tileArea = 720//720*6//720*(1);

var tileMap =   [];
var cows =      [];
var graveyard = [];
let populationCounter = count;
var inspectedCow = null;
var statMap  = new Map();


const maxUpdates = 10000;
let tickCounter = 0;
let simId = null;     //id of update Interval
let renderTimeMapList = [];  //render time deltas
let updateTimeMapList = [];  //update time deltas
var frameCounter = 0;        //intra update frame counter

let tilesRedraw = true;
let paused = false;  
                     
//        |-----------------------------------|
// scale  |  8     4     2     1     .5   .25 |
//        |-----|-----|-----|-----|-----|-----|
// tick   | 2.5    5     10    20     40   80 |
//        |-----------------------------------|

const baseTick = 40; //tick interval for 1x speed
let tickScaler = 1;
let tick = baseTick*tickScaler;


// Recurison of 88 , yielded 14255 tiles , and took about 20 seconds to calculate
const maxFillRecursion = 75;  // recursive limit for filling algo

//load in sprite sheet
let img = document.getElementById("cowsprites");
const cowSpriteSheetWidth  = 128; 
const cowSpriteSheetHeight = 160; 

//Sprite sheet is a [ 4 x 5 ] array of sprites
const cowBaseWidth = cowSpriteSheetWidth/4;
const cowBaseHeight = cowSpriteSheetHeight/5

let cowBaseScale = 1;  //unused , planned for zoom in/zoom out scaling
let diverseColors = false;  //for systems with limited memory , increases performance
let tintColors = [];  //tints available for sprites
if (diverseColors) {
  tintColors = [  'Aqua','Aquamarine','BlueViolet','Brown',
                    'yellow','Chocolate','Blue',   'Crimson',
                    'Cyan','DarkOrange','DeepPink','DarkRed',
                    'Gold'                                    ];
} else {
  tintColors = [  'Aqua','Aquamarine','BlueViolet','Brown', ];
}

/* 
 * My original intent, was to have a process that creates js <Img> elements
 * from exporting a transformation of a local canvas with hue with Canvas.getDataURL()
 * However, the sprite sheet is coming from the web server and thus it is cross-origin,
 * chrome security policy restricts saving 'tainted' canvases (one transforming cross
 * origin images) as a new image, thus I have to resort to saving a canvas for each
 * buffer, or I can save one canvas, in which I can index each hue, I'm unsure which is
 * more performant
 */

//Scaling needs to map sprite dimensions to integers otherwise
//some sprite bits might get cut out, below is a map of 
//supported fractional scaling

//128 |--.75x--> 96  |--.5x-> 64  |--.25x-> 32
//160 |--.75x--> 120 |--.5x-> 80  |--.25x-> 40

//map maturity stages to scales of base sprite dimensions
let maturityScale = {
                      baby  : .5,
                      child :.75,
                      adult :1
                    }
//for each color and each maturity scale render a canvas of the sprite sheet
let spriteTints =   {
                     baby:  {},
                     child: {},
                     adult: {}
                    }

let renderTints = function() {
  let start  = performance.now();
  //render 3 canvas for each color 
  Object.keys(spriteTints).forEach( mat => {
    //get the scale for this maturity group
    let scale = maturityScale[mat];
    tintColors.forEach ( col => {
      //create a temporary canvas
      let preBuffer = document.createElement('canvas');
      preBuffer.width  = cowSpriteSheetWidth;
      preBuffer.height = cowSpriteSheetHeight;
      let preBuffCtx = preBuffer.getContext('2d');
      preBuffCtx.imageSmoothingQuality = 'high';

      //create the space for the resultant buffer
      let postBuffer = document.createElement('canvas');
      postBuffer.width  = cowSpriteSheetWidth;
      postBuffer.height = cowSpriteSheetHeight;
      let postBuffCtx = postBuffer.getContext('2d');
      postBuffCtx.imageSmoothingQuality = 'high';

      //fill preBuffer with tint color
      preBuffCtx.fillStyle = col;
      preBuffCtx.fillRect(0,0,preBuffer.width,preBuffer.height);

      //destination atop makes result with an alpha channel identical 
      //to fg with all pixels retaining original color
      preBuffCtx.globalCompositeOperation = "destination-atop";
      preBuffCtx.drawImage(cowsprites,0,0);

      postBuffCtx.drawImage(cowsprites,0,0);
      //apply the tint from preBuffer
      postBuffCtx.globalAlpha = .4;
      postBuffCtx.drawImage(preBuffer,0,0);

      let finalBuffer = document.createElement('canvas');
      finalBuffer.width  =  Math.floor(cowSpriteSheetWidth*scale);
      finalBuffer.height =  Math.floor(cowSpriteSheetHeight*scale);
        let finalCtx = finalBuffer.getContext('2d');
      finalCtx.scale(scale,scale);
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(postBuffer,0,0);

      // save canvas to a map
      spriteTints[mat][col] = finalBuffer;
    });
  //add original image to tintColors options
  tintColors.original = img;
  });
  console.log("sprite transformation rendering took " , performance.now() - start);
}



//Map of Canvases used
let cans = [   { name: 'map'   , can : mapCanvas          , con: leftPane },
               { name: 'cow'   , can : cowCanvas          , con: leftPane },
               { name: 'bird'  , can : entityBirdEyeCanvas, con: entityBirdEyePane },
               { name: 'gene'  , can : entityGeneCanvas   , con: entityGenePane }
           ]


//add pause play logic to elements in the DOM

playRadio.oninput = function() {
  console.log("play hit");
  paused = play.value != "play";
  console.log(paused);
}

pauseRadio.oninput = function() {
  console.log("pause hit");
  paused = pause.value == "pause";
  console.log(paused);
}

sliderElements.forEach( se => {
  se.oninput = function() {
    if (se.checked) {
      scale = se.value;
      console.log("se val : " , se.value);
      tick = baseTick*scale;
    }
  }
});



/* Resize each canvas to adhere to the Aspect Ratio */
let adjustGraphics = function() {

  console.log("Resizing Canvases for client");

  console.log("Initial canvases");
  cans.forEach ( c => {
    console.log("canvas : " + c.name  + " width : "  + c.can.width + " height :" + c.can.height);
  });

  // Note approach is un-optimal (although little relative efficiency is lost)
  // This should be a straight forward function of modulus
  cans.forEach( c => {
    
    let nearestRes = { x : AspectRatio.x , y : AspectRatio.y };
    let maxed = false;
    while ( nearestRes.x < c.con.offsetWidth && nearestRes.y < c.con.offsetHeight ) {
      nearestRes.x += AspectRatio.x;
      nearestRes.y += AspectRatio.y;
    }
    nearestRes.x -= AspectRatio.x;
    nearestRes.y -= AspectRatio.y;

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
  if ( terrainWidth > mapCanvas.width ) {
    terrainWidth = mapCanvas.width*(18/20);
    console.warn("terrain width exceeded logical width adjusted");
  }
  if ( terrainHeight > mapCanvas.height ) {
    terrainHeight = mapCanvas.height*(18/20);
    console.warn("terrain height exceeded logical height adjusted");
  }
  if (terrainX > mapCanvas.width ) {
    terrainX = terrainWidth/18;
    console.warn("terrain x exceeded logical width adjusted");
  }
  if ( terrainY > mapCanvas.height ) {
    terrainY = terrainHeight/18;
    console.warn("terrain y exceeded logical height adjusted");
  }

  /*
  buildTileMap();
  applyTerrain();
  buildCows(count);
  start();
  renderTints();
  */


}

let initialize = function() {
  adjustGraphics();
  buildTileMap();
  renderTints();
  applyTerrain();
  buildCows(count);
  start();
}


document.addEventListener("DOMContentLoaded", initialize);


////////////////////
//Utility
///////////////////


// While no issues are present now, this implementation is needlessly bound
// to 2D. This should be a generalized vector math class, that supports
// the computation of n-vectors -->
// Considerations: 
//  toInt (wrapper around math.floor)
//  dotProduct
//  crossProduct
//  norm
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

//take in two points (as vectors)      ^
//return angle between them           /
//                                   / ?
//                                   ---->
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
   if (this.needsRedraw) {
     this.ctx.stroke(this.path);
     if ( this.type != null ) {
       this.ctx.save();
       this.ctx.fillStyle = this.type.color;
       this.ctx.fill(this.path);
       this.ctx.restore();
     }
   }
  }

  update() {
    if ( this.type != null ) {
      this.type.update();
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

//64 colors for growth phase of grass tiles
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
    this.color = grain[Math.ceil( (this.harvestLevel / this.harvestMax)*(grain.length-1))];
  }

  update() {
    //grass tile
    if (this.harvestLevel < this.harvestMax) {
      this.harvestLevel += this.harvestRate;
    }
    if (this.harvestLevel > this.harvestMax) {
      this.harvestLevel = this.harvestMax;
    }
    this.color = grain[Math.floor( (this.harvestLevel / this.harvestMax)*(grain.length-1) )];
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
  constructor(tile,env,color,name,genes,maturity) {
    //graphics context
    this.ctx = cowCtx;

    ////////////////////////
    //genetic attributes
    ////////////////////////
    //
    this.genes = genes;
    this.maturity = maturity;  //what phase of growth I am in

    this.absorption      = this.genes['absorption'];    //impact hydration cap
    this.agility         = this.genes['agility'];    //ease of traversal
    this.desiribility    = this.genes['desiribility'];    //likelihood of mating
    this.endurance       = this.genes['endurance'];    //impact energy cap
    this.hermitic        = this.genes['hermitic'];    //desire to avoid others
    this.hostility       = this.genes['hostility'];    //likelihood of attacking others
    this.metabolicEff    = this.genes['metabolicEff'];    //easge of digestion
    this.mindfullness    = this.genes['mindfullness'];    //impact emotion cap
    this.nomadicity      = this.genes['nomadicity'];   //desire to migrate
    this.satiation       = this.genes['satiation'];    //impact hunger cap
    this.urgency         = this.genes['urgency'];    //desire to mate

    ///////////////////////////
    //Model variables
    ///////////////////////////

    this.alive = true;
    this.tile = tile; //tile im located at all
    this.env  = env;  //list of all tiles in the universe
    //this.size = size;
    this.color = color;
    this.spriteSrc = spriteTints[this.color];
    this.name = name;


    this.energyCap =    energyBase    * ((2 * this.endurance)    + 1);  
    this.hungerCap =    hungerBase    * ((2 * this.satiation)    + 1);
    this.emotionCap =   emotionBase   * ((2 * this.mindfullness) + 1);
    this.hydrationCap = hydrationBase * ((2 * this.absorption)   + 1);

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
    this.fitness = 0;
    this.causeOfDeath = null;

    this.previousTile = null;  //what tile the cow is heading to

    this.stateTicks = 0; //what point we are in the current state
                         //cycles between 0 to this.stateCap
    
    this.stateCap   = 0; //how many ticks the current state will last

    this.state = "idle"; //the current state
    this.facing = "north"; 
    this.pos = tile.cp;  //where the cow is intra-state

    this.animCap = 4;   //how many frames the animation has
    this.animSpeed = 1;
    this.boundingPath = null;

    ////////////////////////////
    //debug properties
    ////////////////////////////
    this.debug = false;
  }

  //and draw to the canvas
  draw() {

    let sprWidth  = cowBaseWidth*maturityScale[this.maturity];
    let sprHeight = cowBaseHeight*maturityScale[this.maturity];

    //where to place sprites so they are centered at
    //our tiles ? (position)  center point
    //Warning I'm not sure what this is trying to calculate,
    let centeredx = this.pos.x - (sprWidth)/2;
    let centeredy = this.pos.y - (sprHeight)/2;
    
    //source origin
    //frame position in sprite sheet, derived from 
    //the stateTick % animCap
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


    if (this.state == "move") {

       stateText = "kyyyYAaa";
      //determine direction and adjust sprite indices accordingly
      //at the same time find parameters that will illustrate
      //the direction moved confined to N E S W

      sx = (this.stateTicks % this.animCap)*sprWidth;

      if ( this.facing == "north" ) {
        sy = sprHeight * 2;
      } else if ( this.facing == "east" ) {
        sy = sprHeight * 1;
      } else if ( this.facing == "south") {
        sy = sprHeight * 0;
      } else {
        sy = sprHeight * 1;
        scaleX = -1;
        //adjust dx for flipped scale
        //something is wrong here
        dx = -dx - sprWidth;
      }

    } else if (this.state == "idle") {
      // 3 x [ 0 1 ]
      sx = (this.stateTicks % this.animCap) * sprWidth;
      sy = 3 * sprHeight;

      stateText = "MoooOOooo";

    } else if (this.state == "eat") {
      // 4 x [ 0 1 ]
      sx = (this.stateTicks % this.animCap) * sprWidth;
      sy = 4 * sprHeight;

      stateText = "munch munch";

    } else if (this.state == "rest") {
      // 4 x [ 2 3 ]
      sx = ( (this.stateTicks % this.animCap) + 2)*sprWidth;
      sy = 4 * sprHeight;

      stateText = "zzZzzZzzZ";

    } else if (this.state == "drink") {
      // 4 x [ 2 3 ]
      sx = ((this.stateTicks % this.animCap) + 2) * sprWidth;
      sy = 4 * sprHeight;

      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      stateText = "sLuuuuRp";
    }
   

    //draw sprites with calculated indices
    this.ctx.save();
    this.ctx.scale(scaleX,scaleY);
    //this.ctx.drawImage(cowsprites,sx,sy,sprWidth,sprHeight,dx,dy,sprWidth,sprHeight);
    //console.log(spriteTints[this.maturity][this.color]);
   
    
    //experimental directional sprites unsure of performance impact
    //very confusing due to flipping already in place and up and down sprite already existing
    //I think the goal is to achieve some sort of directional indication for diagnol movement
    /*
    let f = this.facing;
    let ang = f == "north" ? 0 : f == "south" ? Math.PI : f == "east" ? Math.PI/2 : -Math.PI/2;
    this.ctx.translate(this.pos.x,this.pos.y);
    //this.ctx.translate(centeredx,centeredy);
    //this.ctx.fillRect(centeredx,centeredy,5,5);
    //this.ctx.fillStyle = "green";
    //this.ctx.fillRect(this.pos.x,this.pos.y,20,20);
    this.ctx.rotate(ang);
    //this.ctx.translate(-centeredx,-centeredy);
    this.ctx.translate(-this.pos.x,-this.pos.y);
    */
    this.ctx.drawImage(spriteTints[this.maturity][this.color],sx,sy,sprWidth,sprHeight,dx,dy,sprWidth,sprHeight);
    this.ctx.restore();
    //change dx to normal scale
    //only needed it to be flipped for rendering on negative x scale for westward movement.
    dx = centeredx;

    
    //TODO : removing size attribute of cow
    //info bars
    /*
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
    */

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

    // this needs to be redone , does not work when some buckets are zero'd out
    if ( chance < move) {
      //debug option
      choice = "move"; 
      //choice = "eat";
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

      //let tile now I'm here
      this.tile.occupant = this;


      //state housekeeping
      this.state = "move";
      this.stateTicks = 0;
      //how long it takes to traverse is affected by agility
      //introduced graphical inconsistency where when cow is in transit
      //another cow can appear to go into it's spot even though that cow is
      //has left it but it slow ( Maybe introduce hex pockets for placing cows
      //in the same region.
      //In addition to that, cows that take many ticks for one move appear
      //to run at the same speed (animation) and there should be a mechanism
      //to throttle the rate at which animation occurs
      let agilityModifier = Math.ceil(  (1-this.agility)*3  ) * ((this.tile.type.traversability+1)**2);
      console.log("agile " , agilityModifier);

      //10 would be max travel cost 
      //and is discounted by traversability and cows endurance
      //cap endurant discount at .05, means that .95 -> 1 has no difference ...
      //this.energy -= this.tile.type.traversability*10*( Math.max((1-this.agility),.05) );
      this.energy -= this.tile.type.traversability*10*( Math.max((1-this.agility),.05) );

      this.stateCap = 10*Math.floor(agilityModifier);

      //anim housekeeping
      this.animCap = 4;
      this.animSpeed = 1;


      //determine orientation

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
      this.facing = angleDirs[closest].dir;


      //update audit
      this.tilesTraveled++;


  }

  rest() {
    if (this.energy < this.energyCap) {

      //state housekeeping
      this.state = "rest";
      this.stateTicks = 0;
      this.stateCap = 100;
      //anim housekeeping
      this.animCap = 2;
      this.animSpeed = 1;

      //10 is base
      let energyBack = 10 * (this.tile.type.comfort);
      if (this.energyCap < this.energy + energyBack) {
        energyBack -= ( this.energy + energyBack - this.energyCap);
      }
      this.energy+=energyBack;

      //audit
      this.energyRestored += energyBack;

    }
  }

  consume() {
    if ( this.tile.type.harvestLevel != 0) {

      //state housekeeping
      this.state = "eat";
      this.stateTicks = 0;
      this.stateCap = 40;
      //anim housekeeping
      this.animCap = 2;

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

    }
  }

  idle() {
    //state housekeeping
    this.state = "idle";
    this.stateTicks = 0;
    this.stateCap = 20;
    //anim housekeeping
    this.animCap = 2;
    this.animSpeed = 1;
  }


  drink() {
    if ( this.tile.type.hydration != 0) {

      //state housekeeping
      this.state = "drink";
      this.stateTicks = 0;
      this.stateCap = 20;
      //anim housekeeping
      this.animCap = 2;
      this.animSpeed = 1;


      let sipBase = 8;
      let sip = sipBase * this.tile.type.hydration;
      if (this.hydration + sip > this.hydrationCap ) {
        sip = this.hydration + sip - this.hydrationCap;
      }
      this.hydration += sip;
      //audit
      this.hydrationRestored += sip;
    }
  }


  update() {
    //update fitness
    this.fitness = this.energyRestored + this.hungerRestored +
                  this.hydrationRestored + this.tilesTraveled +
                  this.ticks;

    if (!this.alive) {
      return
    }

    this.ticks++;
    if (this.stateTicks != this.stateCap) {
      this.stateTicks++;
      //update the intra state position of the cow
      if (this.state == "move") {
        //find the vector pointing to the destination
        let moveVector = (this.tile.cp).sub(this.previousTile.cp);
        //calculate the change in position for each tick over
        //the stateCap interval
        let dx = (1/this.stateCap)*moveVector.x;
        let dy = (1/this.stateCap)*moveVector.y;
        this.pos = this.pos.add(new point(dx,dy));      

      //below else exists for debugging move logic
      }
      /*
      else {
        this.pos = this.tile.cp;
      }
      */

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


    //Log the start of the new state tick;
    this.stateCurrentTime = 0;


    // TODO
    //Biological consequences should be affected by the environment


    //Biological consequences

    //Ever update hunger is depleted.
    this.hunger -= .2;
    this.energy -= .2;
    this.hydration -= .2;

    // if hunger is severly low , energy is affected more drastically
    let hungerSeverity = 5 - Math.floor( (this.hunger / this.hungerCap)*10);
    //every 10 percentage energy loss below 5, results in n times more energy depleted.
    if ( hungerSeverity > 0) {
      this.energy -= .2*hungerSeverity;
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


////////////// Curve Generation //////////////////////////


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
  //overscaling the shape$a
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

//Draw a radial curve given by the radial function, centered
//(point) center . Curve resolution is defined by iters
function drawRadialCurve(radial,center,revs,iters,ctx) {
  ctx.save();
  ctx.beginPath();
  let dtheta = revs * (2*Math.PI) / iters;
    for ( var i = 0; i <= iters; i++) {
      //current angle
      let z = dtheta*i;
      //current radius scaled by curve.scale
      let r = radial(z);
      let xy = p2r(r,z);
      //translate to center
      xy = xy.add(center);
        if ( i!= 0 ) {
          ctx.lineTo(xy.x,xy.y);
          //if this is the first point, don't draw a line, just start the path
        } else {
          ctx.moveTo(xy.x,xy.y);
        }
      }
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
}



//given a radial function and a scaling rule
//transform the terrain enclosed by the radial function within
//the environment, and apply the tile mutator to each one
// tileMutator(baseTile , tile );
function radialRegionApplyTerrain(tile,env,radial,tileMutator) {
  //Get an enclosed rectangle of the radial function
  //find max value of radial
  let max = 0;
  let prec = 1000;
  for ( let i = 0; i < prec; i++) {
    let ri = radial(2*Math.PI*i/1000);
    max = Math.max(max,ri);
  }
  //construct a bounding square from this max radial with a center at tile.cp
  //if center is tile.cp => (x,y) then rectangle start (top left) is (x-max,y-max);

  //Now we can collect all tiles that atleast fit into this rectangle, to avoid a recursive fill
  let potential = env.filter( t => {
    let tx = t.cp.x
    let ty = t.cp.y
    return ( tx > (tile.cp.x - max) &&
             tx < (tile.cp.x + max) &&
             ty > (tile.cp.y - max) &&
             ty < (tile.cp.y + max) );
  });
  
  let actual = potential.filter( t => {
    //we need to homogenize the coordinates
    let ht = t.cp.sub(tile.cp);
    let pp = r2p(ht); //convert to polar point (r,t)
    let txr = pp.x
    let txt = pp.y //extract  values
    return txr < radial(txt);
  });

  actual.forEach( t => {
    tileMutator(tile,t);
  })
  //return affected tiles
  return actual;


}



//to be done : exchange type with a generator function that takes
//in starting parameters. Can be used to make layered types
//tileMutator( iteration step , total steps , the tile to be mutated )
function recurseApplyTerrain(tile,steps,tileMutator) {
  let i = steps;
  let infected = [];
  let frontier = [tile];
  while ( i > 0 ) {
    console.log("recurseApply " ,i);
    let current = frontier;
    frontier = [];
    current.forEach( t => {
      tileMutator(i,steps,t);
      infected.push(t);
      t.neighbors.forEach( n => {
        if (!infected.includes(n) && !frontier.includes(n) && !current.includes(n)) {
          frontier.push(n);
        }
      });
    });
    i--;
  }
  /*
  ignore = ignore ?? [];
  if (steps <= 0) return;
  if (tile.type != type) tile.type = type;
  tile.neighbors.forEach( t => {
    if (!ignore.includes(t)) {
      t.type = type;
      recurseApplyTerrain(t,steps-1,type,ignore.concat(tile.neighbors));
    }
  });
  */
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

    let color = tintColors[Math.floor(Math.random()*tintColors.length)];
    let name = names[Math.floor(Math.random()*names.length)];

    let genes = {};
    genes['absorption']      =Math.random();    //impact hydration cap
    genes['agility']         =Math.random();     //ease of traversal
    genes['desiribility']    =Math.random();     //likelihood of mating
    genes['endurance']       =Math.random();     //impact energy cap
    genes['hermitic']        =Math.random();     //desire to avoid others
    genes['hostility']       =Math.random();     //likelihood of attacking others
    genes['metabolicEff']    =Math.random();     //easge of digestion
    genes['mindfullness']    =Math.random();     //impact emotion cap
    genes['nomadicity']      =Math.random();     //desire to migrate
    genes['satiation']       =Math.random();     //impact hunger cap
    genes['urgency']         =Math.random();     //desire to mate

    //normalize the gene map such that it is isomorphic to a unit vector in n-space
    //where n is the number of genes that make up a cow
    let rawGeneSum = Object.values(genes).reduce( 
      (prev,current) => 
        prev + current,0
    );
    Object.keys(genes).forEach( (key) => {
      genes[key] /= rawGeneSum;
    });
    
    let maturity = Math.random() > .66 ? "baby":
                  (Math.random() > .5  ? "child" : "adult");

    return new cow(tile,env,color,name,genes,maturity);
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
  let tt = new Tile(cp,polyType,tileArea,0,null);

  //fill out boundary with tiles
  let frontier = [];
  //reset global tile map
  tileMap = [];
  //seed frontier
  frontier.push(tt);
  //fill out the tileMap
  let st = performance.now();
  [frontier,tileMap] = fill(frontier,tileMap,terrainWidth,terrainHeight,terrainX,terrainY);
  let fn = performance.now();
  console.log("Filling time in Seconds" , (fn-st)/100000);
  console.log(tileMap);

}


///////////////////////////////
// Apply Terrain to the tiles
///////////////////////////////

function applyTerrain() {

  let mode = "islands"

  if (mode == "random" ) {

    //Apply grass tiles 
    tileMap.forEach( t => {
      let tv = .2; //traversability
      let hm = 100; //max harvest
      let hl = Math.random()*hm/2; //harvest level
      let hr = (Math.random()*4)*(.01); //harvest rate
      let hd = .2; //hydration
      let com = .4; //comfort
      t.type = new Grass(tv,hl,hr,hm,hd,com);
    });

    //Apply random water tiles
    let wrate = .55
    tileMap.forEach( t => {
      if (Math.random() < wrate) {
        let tv = Math.random()*(.6) + .2; //traversability water can be .2 to .8
        let hm = 100; //max harvest
        let hl = Math.random()*hm; //harvest level
        let hr = (Math.random()*4)*(.01); //harvest rate
        let hd = 1; //hydration
        let com = 0; //comfort
        t.type = new Water(tv,hl,hr,hm,hd,com);
      }
    });

    //Apply rocks
    let rrate = .4;
    tileMap.forEach( t => {
      if (Math.random() < rrate) {
        let tv = Math.random()*.5 + .2
        let hl = 0; //harvest level
        let hr = 0; //harvest rate
        let hm = 0; //max harvest
        let hd = 0; //hydration
        let com = .8; //comfort
        t.type = new Rock(tv,hl,hr,hm,hd,com);
      }
    });

  } else if (mode == "debug" ) {


    //tile mutators (recurse apply)
    /*
    let stoneWaterFold = function(k,steps,tile) {
      if ( k % 2 == 0 ) {
        tile.type = new Rock(.7,0,0,0,0,.2);
      } else {
        tile.type = new Water(1,0,0,0,1,0);
        //Interesting thought experiment, for what value
        // p , do we expect this process to terminate
        // cleary if p = 100% it will never, if the process
        // duplicates, it's likelihood of duplication increases
        // much more becuase the number of changes of duplication 
        // increase with every success
        //
        //if (Math.random() < .05) {
         // recurseApplyTerrain(tile,3,stoneWaterFold);
        //}
      }
    }
   */
   //recurseApplyTerrain(tileMap[20],3,stoneWaterFold);
    //
   } else if (mode == "islands") {



     //grass island mutator
     let grassIsland = function(baseTile,tile) {
        //constructor(t=5,hl=15,hr=.1,hm=100,hd = 1, com = 1) {
      let tv = .2; //traversability
      let hm = 100; //max harvest
      let hl = Math.random()*hm/2; //harvest level
      let hr = (Math.random()*4)*(.01); //harvest rate
      let hd = .2; //hydration
      let com = .4; //comfort
      tile.type = new Grass(tv,hl,hr,hm,hd,com);
     }


     //grass island mutator with random rocks
     let grassIslandRandomRocks = function(baseTile,tile) {
        //constructor(t=5,hl=15,hr=.1,hm=100,hd = 1, com = 1) {
      if ( Math.random() > .2 ) {
        let tv = .15; //traversability
        let hm = 100; //max harvest
        let hl = Math.random()*hm/2; //harvest level
        let hr = (Math.random()*4)*(.01); //harvest rate
        let hd = .2; //hydration
        let com = .4; //comfort
        tile.type = new Grass(tv,hl,hr,hm,hd,com);
      } else {
        let tv = Math.random()*.3 + .1
        let hl = 0; //harvest level
        let hr = 0; //harvest rate
        let hm = 0; //max harvest
        let hd = 0; //hydration
        let com = .8; //comfort
        tile.type = new Rock(tv,hl,hr,hm,hd,com);
      }
     }


     // Islands setups
    let islands = function(count) {


      //function closedCurveFactory(minPeriod,maxPeriod,minAmplitude,maxAmplitude,scale,length,iters)
      let closedCurveRadial = closedCurveFactory(2,6,-1,2,10,15,100);

      //pick count number of random tiles
      let bts = [];
      while ( bts.length < count ) {
        let tile = tileMap[Math.floor(Math.random()*tileMap.length)];
        if (!bts.includes(tile)) {
          bts.push(tile);
        }
      }
    
      let transformed = [];
      //radialRegionApply grass island mutators
      //function radialRegionApplyTerrain(tile,env,radial,tileMutator) {
      bts.forEach( bt  => {
        let closedCurveRadial = closedCurveFactory(2,6,-1,2,8,15,100);
        let changed = radialRegionApplyTerrain(bt,tileMap,closedCurveRadial,grassIslandRandomRocks);
        transformed = transformed.concat(changed);
      });

      //console.log("transformed " , transformed);

      //for all tiles not transformed convert them to water
      let untouched = tileMap.filter ( t => {
        return !transformed.includes(t);
      });

      untouched.forEach( t => {
        //constructor(t,hl,hr,hm,hd,com = 1) {
        let tv = Math.random()*.3 + .7;
        t.type = new Water(tv,0,0,0,1,0);
      });
    }

    //islands mutation
    islands(3);
  }

    console.log("tile map after mutation");
    console.log(tileMap);
}



function buildCows(count) {
  if ( count > tileMap.length ) {
    console.warn("Requested More Cows Than Tiles, Truncating Count to fit");
    count = tileMap.length;
    populationCounter = count;
  }

  //reset cows and graveyard
  cows = [];
  graveyard = [];

  for ( let i = 0; i < count; i++ ) {
    let name = names[Math.floor(Math.random()*names.length)];
    let startFound = false;
    while (!startFound) {
      let tileIndex = Math.floor(Math.random()*tileMap.length);
      let tile = tileMap[tileIndex];
      if (tile.occupant == null) {
        startFound = true;
        let newCow = makeCow(tile,tileMap);
        tile.occupant = newCow;
        cows.push(newCow);
      }
    }
  }
  console.log("Cows Produced");
  console.log(cows);
  populationCounter = count;
  populationDisplay.textContent = count;

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
    //console.warn("---------Cows update--- " + tickCounter + " -----");
    cows.forEach( c => {
      c.update();
    });
    //remove any dead cows
    let dead = [];
    for ( let i = 0; i < cows.length; i++) {
      if (!cows[i].alive) {
        dead.push(i);
        graveyard.push(cows[i]);
        populationCounter--;
        populationDisplay.textContent = populationCounter;
      }
    }
    let removed = 0;
    dead.forEach( d => {
      cows.splice(d-removed,1);
      removed++;
    });
  }

/////////////////////////////
// runStat                 //
/////////////////////////////
function runStat() {

  clearInterval(simId);
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
}


////////////////////////////
// Update Stat Pane       //
////////////////////////////


function inspectedStatUpdate() {
    //only render if a cow is inspected
    if (inspectedCow == null) {
      return
    }
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
    addStat("Maturity : " + ins.maturity);
    addStat("Energy : " + dp(ins.energy));
    addStat("Hunger : " + dp(ins.hunger));
    addStat("Emotion : " + dp(ins.emotion));
    addStat("Hydration : " + dp(ins.hydration));
    addStat("--------------");
    addStat("State : " + ins.state);
    addStat("Ticks : " + ins.ticks);
    addStat("Fitness : " + ins.fitness);
    //change the stat list in the dom

    let index = 0;
    let colors = ['Aqua','Aquamarine','BlueViolet','Brown','Charteuse','Chocolate','Blue',
                  'Crimson','Cyan','DarkOrange','DeepPink','DarkRed','Gold'];
}


/////////////////////////////
//Update Gene Display      //
/////////////////////////////


function inspectedGeneUpdate() {
    //console.log("gene update");
    let geneMap = inspectedCow.genes;

    let index = 0;
    let colors = ['Aqua','Aquamarine','BlueViolet','Brown','yellow','Chocolate','Blue',
                  'Crimson','Cyan','DarkOrange','DeepPink','DarkRed','Gold'];

    entityGeneCtx.clearRect(0,0,entityGeneCanvas.width,entityGeneCanvas.height);

    //side ways bars
    let barGapRatio = .4;   //ratio of space between bars and the space the bars occupy in x
    let barW = entityGeneCanvas.width * .65;
    let barH = entityGeneCanvas.height * (1-barGapRatio) / Object.keys(geneMap).length;
    let barXOffset = Math.floor(entityGeneCanvas.width * .35);

    Object.entries(geneMap).forEach((key,value) => {
      entityGeneCtx.save();
      entityGeneCtx.fillStyle = colors[index];
      entityGeneCtx.lineWidth = 1;

      entityGeneCtx.fillRect(barXOffset,(((barGapRatio*barH) + barH) * index) + barH*2,
                             barW*key[1],barH);

      //stroke text for now, should have html elements in future for faster rendering 
      entityGeneCtx.font = "16px Verdana";
      entityGeneCtx.fillText(key[0],0,(((barGapRatio*barH) + barH) * (index+.5)) + barH*2);
      entityGeneCtx.restore();
      index++;
    });
}


///////////////////////
//Update Bird's Eye  //
///////////////////////

//consider a pre render ( of the bird eye canvas based on map canvas )
//If map canvas updates say at a rate 10 % of the rest of the gfx, we can get away with 
//render an optimized bird's eye view
//we could also pre render sprites in this way but this doubles the memory foot print of 
//the sprite sheets
function inspectedBirdEyeUpdate() {
  //only render if a cow is inspected
  if (inspectedCow == null) {
    return
  }

  //let Icp = inspectedCow.pos;  //follow on movement (cow true position causes artifacting )
  let Icp = inspectedCow.tile.cp;
  //birdW and birdH should be a function of intended zoom
  //we want to confine the space in the cow and map canvas to be strictly less
  //than the space provided in the birdEye Canvas
  let zoom = 4//2;
  let birdW = entityBirdEyeCanvas.width/zoom;
  let birdH = entityBirdEyeCanvas.height/zoom;

  //draw a 200 by 200 box , scaled to 400 400 with tile.cp at center
  let birdX = Icp.x - birdW/2;
  let birdY = Icp.y - birdH/2;
  let scale = 1;
  //entityBirdEyeCtx.imageSmoothingQuality = "high"; /* makes huge difference here */
  entityBirdEyeCtx.clearRect(0,0,entityBirdEyeCanvas.width,entityBirdEyeCanvas.height);
  entityBirdEyeCtx.drawImage(mapCanvas,birdX,birdY,birdW,birdH,0,0,entityBirdEyeCanvas.width,
                                                                 entityBirdEyeCanvas.height);
  entityBirdEyeCtx.drawImage(cowCanvas,birdX,birdY,birdW,birdH,0,0,entityBirdEyeCanvas.width,
                                                                 entityBirdEyeCanvas.height);
  /*
  let mapImg = mapCtx.getImageData(birdX,birdY,birdW,birdH);
  entityBirdEyeCtx.putImageData(mapImg,0,0,entityBirdEyeCanvas.width,entityBirdEyeCanvas.width);

  let cowImg = cowCtx.getImageData(birdX,birdY,birdW,birdH);
  entityBirdEyeCtx.putImageData(cowImg,0,0,entityBirdEyeCanvas.width,entityBirdEyeCanvas.width);
  */
}


////////////////////////////////
//update cow animation state  //
////////////////////////////////


function cowDraw(dt) {
  //clear canvas
  cowCtx.clearRect(0,0,cowCanvas.width,cowCanvas.height);
  //redraw
  cows.forEach( c => {
    c.draw();
  });
}

function tileDraw() {
  //dont need to clear
  //mapCtx.clearRect(0,0,mapCanvas.width,mapCanvas.height);
  tileMap.forEach( t => {
    t.draw();
  });
}


///////////////////////////////
// Master Update call        //
///////////////////////////////


function updateCall(localTick) {
  //check to see if tick has been adjusted by the slider, if so clear this interval
  //and call setInterval again with the new tick rate
  if (tick != localTick) {
    console.warn("tick rate has changed, cancelling interval");
    clearInterval(simId);
    console.warn("setting new interval with tick : " , tick);
    simId = setInterval(updateCall,tick,tick);
  }

  if(paused) {
    return;
  }

  if ( tickCounter > maxUpdates )  {
    clearInterval(simId);


    let renderGroups = ["cows","tiles","genes","stats","birds","total","rDiff"]
    let rs = {};
    renderGroups.forEach( rg => {
      rs[rg] = {
        avg : 0,
        max    : 0,
        min    : Number.MAX_VALUE,
        std    : 0

      }
    });

    //Pass 1
    renderTimeMapList.forEach ( rtm => {
      renderGroups.forEach ( rg => {
        rs[rg].avg += rtm[rg];
        rs[rg].min = Math.min(rs[rg].min,rtm[rg]);
        rs[rg].max = Math.max(rs[rg].max,rtm[rg]);
      });
    });
 
    //Complete Averages
    renderGroups.forEach( rg => {
      rs[rg].avg /= renderTimeMapList.length;
    });

    //Standard Deviation
    renderGroups.forEach( rg => {
      renderTimeMapList.forEach ( rtm => {
        rs[rg].std += Math.pow(rtm[rg] - rs[rg].avg,2);
      });
      rs[rg].std = Math.sqrt( rs[rg].std / renderTimeMapList.length );
    });


    console.warn("--------Stats For Frame Rendering--------");
    console.log(rs); 

    let updateGroups = ["cows","tiles","total"]
    let us = {};
    updateGroups.forEach( ug => {
      us[ug] = {
        avg : 0,
        max    : 0,
        min    : Number.MAX_VALUE,
        std    : 0

      }
    });

    //Pass 1
    updateTimeMapList.forEach ( utm => {
      updateGroups.forEach ( ug => {
        us[ug].avg += utm[ug];
        us[ug].min = Math.min(us[ug].min,utm[ug]);
        us[ug].max = Math.max(us[ug].max,utm[ug]);
      });
    });
 
    //Complete Averages
    updateGroups.forEach( ug => {
      us[ug].avg /= updateTimeMapList.length;
    });

    //Standard Deviation
    updateGroups.forEach( ug => {
      updateTimeMapList.forEach ( utm => {
        us[ug].std += Math.pow(utm[ug] - us[ug].avg,2);
      });
      us[ug].std = Math.sqrt( us[ug].std / updateTimeMapList.length );
    });



    /*
    //Analyze Update deltas
    let uavgs = { cows  : 0,
                 tiles : 0,
                 total : 0
                };
    //console.log(updateTimeMapList); 
    updateTimeMapList.forEach ( utm => {
      Object.keys(utm).forEach( key => {
        uavgs[key] += utm[key];
      });
    });
    Object.keys(uavgs).forEach ( key => {
      uavgs[key] /= updateTimeMapList.length;
    });
    */

    console.warn("--------Stats For Update Processing--------");
    console.log(us);


  } else { 


    let start = performance.now();
    tilesRedraw = true;
    cowsUpdate();
    let cowF  = performance.now();
    tilesUpdate();
    let finish = performance.now();
    //console.log("Update Call took : ", finish - start);
    tickCounter++;

    let updateTimeMap = {
      cows  : cowF - start,
      tiles : finish - cowF,
      total : finish - start
    }

    updateTimeMapList.push(updateTimeMap);

    if (cows.length == 0) {
      runStat();
      console.warn("--------Cow Sim Stats --------");
      console.log(statMap);
    }

    let avgFps = frameCounter * (1 / (tick/1000));
    fpsAvg.textContent = avgFps.toFixed(2);
    frameCounter = 0;

  }

}


function drawAll(lastRender) {
  if ( tickCounter > maxUpdates ) {
    return
  } else {
    let start = performance.now();
    if (tilesRedraw) { //only draw tiles once per tick
      tileDraw();
      tilesRedraw = false;
    }
    let tileF = performance.now();
    cowDraw();
    let cowF = performance.now();
    inspectedGeneUpdate();
    let geneF = performance.now();
    inspectedStatUpdate();
    let statF = performance.now();
    inspectedBirdEyeUpdate();
    let birdF = performance.now();

    let end = birdF;
    let dt = end - lastRender;
    let deltas = { tiles : tileF - start , 
                   cows  : cowF - tileF  ,
                   genes : geneF - cowF  ,
                   stats : statF - geneF ,
                   birds : birdF - statF ,
                   total : birdF - start ,
                   rDiff : dt
                 }
    //console.log(deltas);
    renderTimeMapList.push(deltas);
    frameCounter++;
    fpsInstant.textContent = (1/(dt/1000)).toFixed(2);
    window.requestAnimationFrame(drawAll,end);
  }
}



function start() {

  //set an inspected cow for the entity pane
  inspectedCow = cows[0];
  //give each cow an initial state
  cows.forEach( c => {
    c.update();
  });

  /////////////////////////
  //Change selected Cow
  /////////////////////////

  //Check if the click hits the bounding area of a cow, to pull up information
  //about that cow.
  cowCanvas.addEventListener('click', function(event) {
    cowCtx.fillRect(event.offsetX,event.offsetY,10,10);
    //check where the click is
    console.log("click"); 
    cows.forEach( cw => {
      //determine if the click is inside the path of the cows bounding curve
      //TODO
      //This may find many cows at once, some order should be set for a well defind
      //selection

      let clickX = event.offsetX;
      let clickY = event.offsetY;
      //more optimized due to short circuiting
      if (  
        clickX > cw.pos.x -  (cowBaseWidth*maturityScale[cw.maturity]/2)  && 
        clickX < cw.pos.x +  (cowBaseWidth*maturityScale[cw.maturity]/2)  && 
        clickY > cw.pos.y -  (cowBaseHeight*maturityScale[cw.maturity]/2) && 
        clickY < cw.pos.y +  (cowBaseHeight*maturityScale[cw.maturity]/2)  
         ) 
      {
        console.log("a cow was clicked", cw);
        inspectedCow = cw;
      }

    });
  });

  //Simulation Logic Loop
  simId = setInterval(updateCall,tick,tick);
  //Simulation Animation Loop
  //let startTime = performance.now()
  window.requestAnimationFrame(drawAll,performance.now());

}






































