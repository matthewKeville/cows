//Set Canvas and Viewport dimensions
const cowCanvas = document.querySelector('#cowCanvas');
const mapCanvas = document.querySelector('#mapCanvas');
const width = cowCanvas.width = mapCanvas.width = window.innerWidth;
const height = cowCanvas.height = mapCanvas.height = window.innerHeight;

const cowCtx = cowCanvas.getContext('2d'); 
const mapCtx = mapCanvas.getContext('2d'); 

//load cow sprite sheet
let img = document.getElementById("cowsprites");

const tick = 500; //simulation time step in ms

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
   //console.log("drawing path");
   this.ctx.stroke(this.path);
   if ( this.type != null ) {
     this.ctx.save();
     this.ctx.fillStyle = this.type.color;
     this.ctx.fill(this.path);
     this.ctx.restore();
    
     if (this.type.harvestLevel > 60) {
       //console.log("harvest level is visible");
       this.ctx.save();
       this.ctx.fillStyle = 'rgb(255,255,0)';
       this.ctx.restore();
     }
   }
  }

  update() {
    //console.log("tile update");
    if ( this.type != null ) {
      //console.log("calling update to type");
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


// Terrain Types

//64 phases of growth
 const grain = [ '#884B11' , '#854C11' , '#834E11' , '#815011' , '#7F5211' , '#7D5412' , '#7B5612' , '#785712' ,
                  '#765912' , '#745B13' , '#725D13' , '#705F13' , '#6E6113' , '#6B6213' , '#696414' , '#676614' ,
                  '#656814' , '#636A14' , '#616C15' , '#5E6D15' , '#5C6F15' , '#5A7115' , '#587315' , '#567516' ,
                  '#547716' , '#527916' , '#4F7A16' , '#4D7C17' , '#4B7E17' , '#498017' , '#478217' , '#458417' ,
                  '#428518' , '#408718' , '#3E8918' , '#3C8B18' , '#3A8D19' , '#388F19' , '#359019' , '#339219' ,
                  '#319419' , '#2F961A' , '#2D981A' , '#2B9A1A' , '#299C1A' , '#269D1B' , '#249F1B' , '#22A11B' , 
                  '#20A31B' , '#1EA51B' , '#1CA71C' , '#19A81C' , '#17AA1C' , '#15AC1C' , '#13AE1D' , '#11B01D' , 
                  '#0FB21D' , '#0CB31D' , '#0AB51D' , '#08B71E' , '#06B91E' , '#04BB1E' , '#02BD1E' , '#00BF1F'   ];

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

//Cows are doubly referenced between cow and tile
class cow {
  constructor(tile,env,size,color,name='roxxxane') {
    this.tile = tile; //tile im located at all
    this.env  = env;  //list of all tiles in the universe
    this.size = size;
    this.color = color;
    this.name = name;
    this.alive = true;
    //this.ctx = cowCtx;
    this.ctx = cowCtx;

    //genetic attributes
    this.energyCap = 100;  
    this.hungerCap = 100;
    this.emotionCap = 100;
    this.hydrationCap = 100;

    this.metabolicEff = 1; //easge of digestion
    this.endurance    = 1; //ease of traversal
    this.desiribility = 1; //likelihood of mating
    this.nomadicity   = .5; //desire to migrate
    this.hermitic     = 1; //desire to avoid others
    this.urgency      = 1; //desire to mate
    this.hostility    = 1; //likelihood of attacking others

    //model variables
    this.energy = 100; //physical health
    this.hunger = 100; //energy in the body
    this.emotion = 100; //social satisfaction 
    // on social : nomads lose emotion when stuck in the same place
    //           : hermits lose emotion when stuck with others
    this.hydration = 100;

    //audit
    this.actionLog = [];
    this.energyRestored = 0;
    this.hungerRestored = 0;
    this.hydrationRestored = 0;
    this.tilesTraveled = 0;
    this.ticks = 0;
    this.causeOfDeath = null;

    //state
    this.stateTicks = 0; //how many ticks are left in this state
    this.state = "idle";

    this.facing = "north";  

    this.anim = "idle";
    this.animTicks = 0;
    this.animCap = 4;

	  this.path = new Path2D();
	  this.path.arc(this.tile.cp.x,this.tile.cp.y,this.size,0,2*Math.PI);
  }

  draw() {
  }

  //change the animation frame
  //and draw to the canvas
  animate() {
    //console.log("cow animation + " + this.animTicks);
    //body
    /*
    this.ctx.save();
    this.ctx.fillStyle=this.color;
    this.ctx.fill(this.path);
    this.ctx.restore();
    this.ctx.save();
    */


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

    //border containing sprite
    this.ctx.strokeRect(centeredx,centeredy,sprWidth,sprHeight);

    let flip = false;

    if (this.state == "move") {
      
      //params for drawing a line indicating movement
      let lx = 0;
      let ly = 0;
      let ll = 40;

      sx = (this.animTicks % 4)*sprWidth;

      if ( this.facing == "north" ) {
        lx = this.tile.cp.x;
        ly = this.tile.cp.y - ll;

        sy = sprHeight * 2;
      } else if ( this.facing == "east" ) {
        lx = this.tile.cp.x + ll;
        ly = this.tile.cp.y;

        sy = sprHeight * 1;
      } else if ( this.facing == "south") {
        lx = this.tile.cp.x;
        ly = this.tile.cp.y + ll;

        sy = sprHeight * 0;
      } else {
        lx = this.tile.cp.x - ll;
        ly = this.tile.cp.y;

        sy = sprHeight * 1;
        scaleX = -1;
        dx = -centeredx - sprWidth;
      }

      //draw a line indicating direction
      //find the correct animation indices 
      //for each direction 

      this.ctx.save();
      this.ctx.strokeStyle = "red";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(this.tile.cp.x,this.tile.cp.y);
      this.ctx.lineTo(lx,ly);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.restore();

      //dispatch a visual indicator of event
      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      this.ctx.fillText("Kyyaa" , this.tile.cp.x - this.size, this.tile.cp.y - this.size*4);



    } else if (this.state == "idle") {
      // 3 x [ 0 1 ]
      sx = (this.animTicks % 2) * sprWidth;
      sy = 3 * sprHeight;

      //dispatch a visual indicator of event
      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      this.ctx.fillText("Mooooo" , this.tile.cp.x - this.size, this.tile.cp.y - this.size*4);

    } else if (this.state == "eat") {
      // 4 x [ 0 1 ]
      sx = (this.animTicks % 2) * sprWidth;
      sy = 4 * sprHeight;

      //dispatch a visual indicator of event
      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      this.ctx.fillText("munch" , this.tile.cp.x - this.size, this.tile.cp.y - this.size*4);

    } else if (this.state == "rest") {
      // 4 x [ 2 3 ]
      sx = ((this.animTicks % 2) + 2)*sprWidth;
      sy = 4 * sprHeight;

      //dispatch a visual indicator of event
      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      this.ctx.fillText("zzZzzZZ" , this.tile.cp.x - this.size, this.tile.cp.y - this.size*4);


    } else if (this.state == "drink") {
      // 4 x [ 2 3 ]
      sx = ((this.animTicks % 2) + 2) * sprWidth;
      sy = 4 * sprHeight;

      //dispatch a visual indicator of event
      this.ctx.fillStyle = "red";
      this.ctx.font = '12px monospace';
      this.ctx.fillText("slurp" , this.tile.cp.x - this.size, this.tile.cp.y - this.size*4);

    }

    //draw sprites with calculated indices
    this.ctx.save();
    this.ctx.scale(scaleX,scaleY);
    this.ctx.drawImage(cowsprites,sx,sy,sprWidth,sprHeight,dx,dy,sprWidth,sprHeight);
    this.ctx.restore();

    //update animation state
    this.animTicks = (this.animTicks + 1) % this.animCap;


    //info bars
    this.ctx.fillStyle = "green";
    this.ctx.fillRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.25,(this.energy/this.energyCap)*this.size*2,5);
    this.ctx.strokeRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.25,this.size*2,5);
    this.ctx.fillStyle = "orange";
    this.ctx.fillRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.5,(this.hunger/this.hungerCap)*this.size*2,5);
    this.ctx.strokeRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.5,this.size*2,5);
    this.ctx.fillStyle = "yellow";
    this.ctx.fillRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.75,(this.emotion/this.emotionCap)*this.size*2,5);
    this.ctx.strokeRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*2.75,this.size*2,5);
    this.ctx.fillStyle = "blue";
    this.ctx.fillRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*3,(this.hydration/this.hydrationCap)*this.size*2,5);
    this.ctx.strokeRect(this.tile.cp.x - this.size, this.tile.cp.y - this.size*3,this.size*2,5);
    this.ctx.fillStyle = "black";
    this.ctx.font = '20px monospace';
    this.ctx.fillText(this.name , this.tile.cp.x - this.size, this.tile.cp.y - this.size*3.25);
    this.ctx.restore();
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
 
    //Can I eat? - set minimum deficit to 10%
    /*
    if (this.hunger/this.hungerCap > .90) {
      eat = 0;
    }
    */
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

      ///
      rest = depleteFactor;
    }
    if (eat  != 0) {
      //set eat score
      let hungerFactor = 100*((this.hungerCap - this.hunger)/this.hungerCap);

      //
      eat = hungerFactor;
    }
    if (move != 0) {
      //set move score
      //nomadicty gets a scale of 40 votes
      let nomadicFactor = 50 * this.nomadicity;

      ////
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
      //let tile know I left
      this.tile.occupant = null;

      //update facing based on old tile and previous
      //find which direction up down left right , has the smallest angle with the vector
      //generated between the old and previous tile
      //let dirVec = new point(moves[dir].cp.x - this.tile.cp.x ,moves[dir].cp.y - this.tile.cp.y)

      let dirVec = new point(this.tile.cp.x - moves[dir].cp.x ,this.tile.cp.y - moves[dir].cp.y)

    
      let angleDirs = [];
      angleDirs.push({ dir: "north" , dist : vecAngle(dirVec,new point(0,1)) } ); //north
      angleDirs.push({ dir: "east" , dist : vecAngle(dirVec,new point(1,0)) } ); //north
      angleDirs.push({ dir: "south" , dist : vecAngle(dirVec,new point(0,-1)) } ); //north
      angleDirs.push({ dir: "west" , dist : vecAngle(dirVec,new point(-1,0)) } ); //north
      let closest = 0;
      for ( let i = 0; i < angleDirs.length; i++ ) {
        if (angleDirs[i].dist < angleDirs[closest].dist) {
          closest = i;
        }
      }
      this.facing = angleDirs[closest].dir;
      

      //remind myself where I am
      this.tile = moves[dir];

      //10 would be max travel cost 
      //and is discounted by traversability and cows endurance
      //cap endurant discount at .05, means that .95 -> 1 has no difference ...
      this.energy -= this.tile.type.traversability*10*( Math.max((1-this.endurance),.05) );
      //let tile now I'm here
      this.tile.occupant = this;

      //update the rendering path for the cow
      this.path = new Path2D();
      this.path.arc(this.tile.cp.x,this.tile.cp.y,this.size,0,2*Math.PI);



      //update audit
      this.tilesTraveled++;


      //state housekeeping
      this.state = "move";
      this.stateTicks = 2;

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
      this.stateTicks = 8;

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

      this.state = "eat";
      this.stateTicks = 4;

    }


      
  }

  idle() {
    this.state = "idle";
    this.stateTicks = 2;
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

      this.state = "drink";
      this.stateTicks = 2;

    }
  }


  update() {

    if (!this.alive) {
      return
    }

    this.ticks++;
    if (this.stateTicks != 0) {
      this.stateTicks--;
    } 

    //only change state of current state is finished
    if (this.stateTicks == 0) {

      let action = this.imperative();
      //console.log(this.name + " " + action);
      if (action == "eat") {
        this.consume();  
        this.actionLog.push("eat");
      } else if ( action == "rest" ) {
        this.rest();
        this.actionLog.push("rest");
        console.log("someone is resting");
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
      console.log("Actions");
      console.log(this.actionLog);

      console.log("Energy Restored : " + this.energyRestored);
      console.log("Hunger Restored : " + this.hungerRestored);
      console.log("Hydration Restored : " + this.hydrationRestored);
      console.log("Tiles Traveled : " + this.tilesTraveled);
      console.log("Ticks : " + this.ticks);
      console.log("Cause of Death : " + this.causeOfDeath);
    }

    //requst drawing
    this.draw();
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
let fill = function(frontier,closed,width,height,x,y,debug=0) {

  if (frontier.length == 0 || debug == 50) {
    console.log("frontier closed");
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
        console.log(internalOffset);
        /*
        if ( proto.n == 3 ) {
          theta = ( 2*Math.PI*i/proto.n) + tile.rotOff + internalOffset;
        }
        */

        let vx = tile.cp.x + 2*tile.apothem*Math.cos(theta); 
        let vy = tile.cp.y + 2*tile.apothem*Math.sin(theta);

        /*
        ctx.save();
        ctx.moveTo(tile.cp.x,tile.cp.y);
        ctx.lineTo(vx,vy);
        ctx.stroke();
        */

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


//Construct a world boundary and fill it with tiles.
//first tile placement
let cp = new point(100,100);
let tt = new Tile(cp,6,720*2,Math.PI/2,null);

//tiling

let landScapeWidth = 800;
let landScapeHeight = 600;

//illustrate world boundary
//mapCtx.strokeRect(cp.x,cp.y,landScapeWidth,landScapeHeight)

//fill out boundary with tiles
let frontier = [];
let closed = [];
frontier.push(tt);
[frontier,closed] = fill(frontier,closed,landScapeWidth,landScapeHeight,cp.x,cp.y);
console.log(closed);

///////////////////////////////
// Apply Terrain to the tiles
///////////////////////////////

closed.forEach( t => {
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
closed.forEach( t => {
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
closed.forEach( t => {
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


//////////////////////
// Cow instanatiation
//////////////////////

const names = [ "spark" , "cherry" , "plop", "ting" , "rocky", "spuck",
                "wop"   , "slop"   , "pog" , "glop" , "spur" , "whisp",
                "tuna"  , "gorsh"  , "mil" , "tran" , "sorch", "bash" ,
                "grass" , "rock" , "fire" , "light" , "wet"  , "twig" ,
                "plain" , "valley" , "hill" , "beach" , "dry" , "mad" ];

let cows = [];
let graveyard = [];
let count = 10;
for ( let i = 0; i < count; i++ ) {
  let r = Math.random()*100 + 155;
  let g = Math.random()*100 + 155;
  let b = Math.random()*100 + 155;
  let color = "rgb(" + r + "," + g + "," + b +")";
  let name = names[Math.floor(Math.random()*names.length)];
  let startFound = false;
  while (!startFound) {
    let tileIndex = Math.floor(Math.random()*closed.length);
    let tile = closed[tileIndex];
    if (tile.occupant == null) {
      startFound = true;
      cows.push( new cow(tile,closed,20,color,name));
    }
  }
}
console.log(cows);

let tilesUpdate = function () {
  closed.forEach( c => {
    c.update();
    //c.renderPath();
    /*
    if ( c.needsRedraw ) {
      c.draw();
    }
    */
  });
}

let cowsUpdate = function () {
  cows.forEach( c => {
    c.update();
    //c.draw();
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



let cowAnimation = function() {
  cowCtx.clearRect(0,0,1920,1080);
  cows.forEach( c => {
    c.animate();
  });
}


let updateCall = function() {
  
  //console.log("updating");
  if ( cows.length == 0 ) {
    clearInterval(id);
    console.log(graveyard);
  }

  mapCtx.clearRect(0,0,1920,1080);
  tilesUpdate();

  let frames = 5;
  for ( let i = 0; i < frames; i++) {
    setTimeout(cowAnimation,(tick/frames)*i);
  }
  cowsUpdate();
}

let id = setInterval(updateCall,tick);









































