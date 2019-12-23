function cosSim(v1, v2) {
   return p5.Vector.dot(v1, v2) / (v1.mag() * v2.mag());
}

function randInRange(min, max) {
   var res = Math.random() * (max - min) + min;
   return res;
}

function randInArray(arr) {
   if (Array.isArray(arr) && arr.length == 2) {
      return randInRange(arr[0], arr[1]);
   }
}

function removeByAttr(arr, attr, value) {
   var i = arr.length;
   var removedItem;
   while (i--) {
      if (arr[i] &&
         arr[i].hasOwnProperty(attr) &&
         (arguments.length > 2 && arr[i][attr] === value)) {
         removedItem = arr[i];
         arr.splice(i, 1);
         return removedItem;

      }
   }
}

function clamp(number, min, max) {
   return Math.max(min, Math.min(number, max));
}

class Agent {
   constructor(options) {
      this.brain = options.brain;
      this.id = options.id;
      this.gen = options.gen;
      this.x = options.x;
      this.y = options.y;
      this.dir = options.dir;
      this.turnRate = options.turnRate || 0.1;
      this.speed = options.speed || 3;
      this.size = options.size || 10;
      this.visionRadius = options.visionRadius || 50;
      this.meatValue = options.meatValue || 0.5;
      this.snl = this.size * 0.866;
      this.desiredForward = createVector(Math.cos(this.dir), Math.sin(this.dir));
      this.currForward = createVector(Math.cos(this.dir), Math.sin(this.dir));
      this.energy = this.size * 100;
      this.maxEnergy = this.energy;
      this.color = options.color;
   }

   getPoints() {
      var C = this.currForward.x;
      var S = this.currForward.y;
      var p1x = this.size/2 * C;
      var p1y = this.size/2 * S;

      var p2x = (-this.size / 2) * C + this.snl * S;
      var p2y = (-this.size / 2) * S - this.snl * C;

      var p3x = 0;
      var p3y = 0;

      var p4x = (-this.size / 2) * C - this.snl * S;
      var p4y = (-this.size / 2) * S + this.snl * C;

      var res = [this.x + p1x, this.y + p1y, this.x + p2x / 2, this.y + p2y / 2, this.x + p3x, this.y + p3y, this.x + p4x / 2, this.y + p4y / 2];
      return res;
   }

   update() {
      var NNinps = [
         [0],
         [0],
         [0],
         [0],
         [0],
         [0],
         [0],
         [0],
         [0]
      ];
      var cf = this.getCloseFoods();
      if (cf[3].length != 0) { //if on food
         for (var i = 0; i < cf[3].length; i++) {
            this.energy += removeByAttr(foods, 'id', cf[3][i]).size * foodValueMultiplier; // remove & get energy from eating food
            createNewFood();
         }
      }
      NNinps[0][0] = cf[0];
      NNinps[1][0] = cf[1];
      NNinps[2][0] = cf[2];

      var ca = this.getCloseAgents();
      if (ca[7].length != 0) { //on bigger fish
         this.die();
      } else {
         if (ca[6].length != 0) { //on smaller fish
            for (var i = 0; i < ca[6].length; i++) {
               var smallerFish = findAgentByID(ca[6][i]);
               this.energy += smallerFish.size * foodValueMultiplier * this.meatValue; // remove & get energy from eating smaller fish
               smallerFish.die();
            }
         }
         NNinps[3][0] = ca[0];
         NNinps[4][0] = ca[1];
         NNinps[5][0] = ca[2];
         NNinps[6][0] = ca[3];
         NNinps[7][0] = ca[4];
         NNinps[8][0] = ca[5];
      }
      // var out = 0;
      var out = getOutputs(this.brain, NNinps);
      if (out == 0) {
         this.desiredForward.x = -this.currForward.y;
         this.desiredForward.y = this.currForward.x;
      } else if (out == 1) {
         this.desiredForward.x = this.currForward.x;
         this.desiredForward.y = this.currForward.y;
      } else {
         this.desiredForward.x = this.currForward.y;
         this.desiredForward.y = -this.currForward.x;
      }
      this.desiredForward.normalize();
      this.currForward.x += (this.desiredForward.x - this.currForward.x) * this.turnRate;
      this.currForward.y += (this.desiredForward.y - this.currForward.y) * this.turnRate;
      this.currForward.normalize();
      this.x += this.speed * this.currForward.x;
      this.y += this.speed * this.currForward.y;
      this.x = (this.x + w) % w;
      this.y = (this.y + h) % h;
      this.energy -= this.speed * this.size / energyLossValueMultiplier;
      if (this.energy > this.maxEnergy) {
         console.log("ready to give birth");
         createDescendants(this, 2);
         this.energy = this.maxEnergy*0.8;
      }
      if (this.energy <= 0) {
         if(agents.length<maxAgents && hatchQueue.length>0){
            createDescendant(hatchQueue.splice(0, 1));
         }
         this.die();
      }
   }

   getCloseFoods() {
      var res = [0, 0, 0, []];
      for (var i = 0; i < foods.length; ++i) {
         var d = this.dist2AgentSq(foods[i]);
         if (d < this.visionRadius * this.visionRadius) {
            if (d <= (this.size/2 + foods[i].size/2) * (this.size/2 + foods[i].size/2)) {
               res[3].push(foods[i].id);
            } else {
               var a = this.currForward;
               var b = createVector(foods[i].x - this.x, foods[i].y - this.y);
               if (cosSim(a, b) > 0.8) {
                  res[1] += 1;
               } else {
                  var angle = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
                  if (a.x * b.y - a.y * b.x < 0) {
                     // angle = -angle;
                     res[0] += 1;
                  } else {
                     res[2] += 1;
                  }
               }
            }
         }
      }
      res[0] /= foods.length;
      res[1] /= foods.length;
      res[2] /= foods.length;
      return res;
   }

   getCloseAgents() {
      var res = [0, 0, 0, 0, 0, 0, [],
         []
      ]; //smaller directional, bigger directional, smaller on, bigger on
      for (var i = 0; i < agents.length; ++i) {
         var d = this.dist2AgentSq(agents[i]);
         if (d < this.visionRadius * this.visionRadius && d != 0) {
            if (d <= (this.size/2 + agents[i].size/2) * (this.size/2 + agents[i].size/2)) { //on another fish
               if (agents[i].size > this.size) {
                  res[7].push(agents[i].id); //on bigger fish
               } else {
                  res[6].push(agents[i].id); //on smaller fish
               }
            } else { //just seeing another fish
               var a = this.currForward;
               var b = createVector(agents[i].x - this.x, agents[i].y - this.y);
               if (cosSim(a, b) > 0.8) { //other fish is in front
                  if (agents[i].size > this.size) {
                     res[4] += 1; //bigger fish in front
                  } else {
                     res[1] += 1; //smaller fish in front
                  }
               } else { //other fish is to the side
                  var angle = Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
                  if (a.x * b.y - a.y * b.x < 0) { //other fish is to left(?)
                     if (agents[i].size > this.size) {
                        res[3] += 1; //bigger fish to left
                     } else {
                        res[0] += 1; //smaller fish to left
                     }
                  } else {
                     if (agents[i].size > this.size) { //other fish is to right(?)
                        res[5] += 1; //bigger fish to right
                     } else {
                        res[2] += 1; //smaller fish to right
                     }
                  }
               }
            }
         }
      }
      res[0] /= agents.length;
      res[1] /= agents.length;
      res[2] /= agents.length;
      res[3] /= agents.length;
      res[4] /= agents.length;
      res[5] /= agents.length;
      return res;
   }

   dist2AgentSq(otherAgent) {
      return (otherAgent.x - this.x) * (otherAgent.x - this.x) + (otherAgent.y - this.y) * (otherAgent.y - this.y);
   }

   die() {
      if(agents.length<=minAgents){
         createRandomAgent();
      }
      removeByAttr(agents, 'id', this.id);
   }
}

class Food {
   constructor(options) {
      this.id = options.id;
      this.x = options.x;
      this.y = options.y;
      this.size = options.size || 10;
   }
}

var cnv;

var agents = [];
var idCount = 0;

var foods = [];

var agentSizeRange = [10, 35];
var speedRange = [1, 5];
var visionRadiusRange = [50, 300];
var turnRateRange = [0.05, 0.1];

var foodSizeRange = [5, 20];

var hatchQueue = [];

var w, h;

var NNlayers = [9, 6, 3];
//in: food left, food ahead, food right, smaller fish left, smaller fish ahead, smaller fish right,
//    bigger fish left, bigger fish ahead, bigger fish right
//out: left, ahead, right

var numAgents = 20;
var maxAgents = 30;
var minAgents = 15;
var numFoods = 40;
var epsilon = 0.3;
var delta = 0.05;
var foodValueMultiplier = 20;
var energyLossValueMultiplier = 25;

function setup() {
   w = window.innerWidth;
   h = window.innerHeight;
   cnv = createCanvas(w, h);
   cnv.position(0, 0);
   cnv.id("p5Canvas");
   setupCoolors();
   noStroke();
   for (var i = 0; i < numAgents; ++i) {
      createRandomAgent();
   }

   for (var i = 0; i < numFoods; ++i) {
      createNewFood();
   }

}

function draw() {
   clear();
   for (var i = 0; i < agents.length; ++i) {
      agents[i].update();
   }
   for (var i = 0; i < agents.length; ++i) {
      noStroke(2);
      // strokeWeight(1);
      // stroke(coolors.ghostwhite);
      fill(coolors.transparentMint);
      ellipse(agents[i].x, agents[i].y, agents[i].visionRadius);
      // noFill();
      // for(var j = 1; j<agents[i].gen; j++){
      //    ellipse(agents[i].x, agents[i].y, agents[i].visionRadius+4*j);
      // }
      strokeWeight(2);
      if(agents[i].color<myColorArr.length && agents[i].color>=0){
         stroke(myColorArr[agents[i].color]);
      }else{
         stroke(coolors.ghostwhite);
      }
      // noFill();
      ellipse(agents[i].x, agents[i].y, agents[i].size);
   }
   noStroke();
   fill(color(239, 71, 111));
   for (var i = 0; i < foods.length; ++i) {
      ellipse(foods[i].x, foods[i].y, foods[i].size);
   }
   for (var i = 0; i < agents.length; ++i) {
      var p = agents[i].getPoints();
      var r = agents[i].energy * 200 / agents[i].maxEnergy;
      r = Math.round(r) + 55;
      fill(color(r, r, r));
      quad(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
   }
}

function findAgentByID(id){
   for(var i = 0; i<agents.length; i++){
      if(agents[i].id==id){
         return agents[i];
      }
   }
}

function createRandomAgent(){
   agents.push(new Agent({
      id: idCount,
      gen: 1,
      x: Math.round(Math.random() * w),
      y: Math.round(Math.random() * h),
      dir: Math.random() * 3.1415,
      size: randInArray(agentSizeRange),
      speed: randInArray(speedRange),
      meatValue: randInArray([0.0,1.0]),
      visionRadius: randInArray(visionRadiusRange),
      turnRate: randInArray(turnRateRange),
      brain: createRandomNN(NNlayers, -50, 50),
      color: idCount%myColorArr.length,
   }));
   idCount++;
}

function createNewFood(){
   foods.push(new Food({
      id: idCount,
      x: Math.round(Math.random() * w),
      y: Math.round(Math.random() * h),
      size: randInArray(foodSizeRange),
   }));
   idCount++;
}

function createDescendants(agent, num){
   for(var i = 0; i<num; i++){
      if(agents.length<maxAgents && hatchQueue.length==0){
         createDescendant(agent);
      }else{
         hatchQueue.push($.extend(true, {}, agent));
      }
   }
}

function createDescendant(agent){
   agents.push(new Agent({
      id: idCount,
      gen: agent.gen+1,
      x: Math.round(Math.random() * w),
      y: Math.round(Math.random() * h),
      dir: Math.random() * 3.1415,
      size: (Math.random()<epsilon) ? clamp(((Math.random()*delta-(delta/2))*(agentSizeRange[1]-agentSizeRange[0])+agent.size), agentSizeRange[0], agentSizeRange[1]) : (agent.size),
      speed: (Math.random()<epsilon) ? clamp(((Math.random()*delta-(delta/2))*(speedRange[1]-speedRange[0])+agent.speed), speedRange[0], speedRange[1]) : (agent.speed),
      meatValue: (Math.random()<epsilon) ? clamp(((Math.random()*delta-(delta/2))+agent.speed), 0, 1) : (agent.meatValue),
      visionRadius: (Math.random()<epsilon) ? clamp(((Math.random()*delta-(delta/2))*(visionRadiusRange[1]-visionRadiusRange[0])+agent.visionRadius), visionRadiusRange[0], visionRadiusRange[1]) : (agent.visionRadius),
      turnRate: (Math.random()<epsilon) ? clamp(((Math.random()*delta-(delta/2))*(turnRateRange[1]-turnRateRange[0])+agent.turnRate), turnRateRange[0], turnRateRange[1]) : (agent.turnRate),
      color: agent.color,
      brain: randomizeNN(agent.brain),
   }));
   idCount++;
}

function randomizeNN(brain){
   var res = $.extend(true, {}, brain);
   for(var i = 1; i<res.length; i++){
      if(res[i].length!=undefined){
         for(var j = 0; j<res[i].length; j++){
            if(res[i][j].length!=undefined){
               for(var k = 0; k<res[i][j].length; k++){
                  if(res[i][j][k].length==undefined){
                     res[i][j][k] += (Math.random()<epsilon) ? ((Math.random()*delta-(delta/2))*100) : 0;
                  }
               }
            }
         }
      }
   }
   return res;
}

function createNN(size) {
   var res = [];
   res.splice(0, 0, [
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0]
   ]);
   for (var i = 1; i < size.length; i++) {
      res.push(makeArray(size[i - 1], size[i], 0));
   }
   return res;
}

function createRandomNN(size, min, max) {
   var res = [];
   res.splice(0, 0, [
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0],
      [0]
   ]);
   for (var i = 1; i < size.length; i++) {
      res.push(makeArray(size[i - 1], size[i], randInRange(min, max)));
   }
   for(var i = 1; i<res.length; i++){
      if(res[i].length!=undefined){
         for(var j = 0; j<res[i].length; j++){
            if(res[i][j].length!=undefined){
               for(var k = 0; k<res[i][j].length; k++){
                  res[i][j][k] = randInRange(min, max);
               }
            }
         }
      }
   }
   return res;
}

function mmultiply(a, b) {
   return a.map(x => transpose(b).map(y => dotproduct(x, y)));
}

function dotproduct(a, b) {
   return a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
}

function transpose(a) {
   return a[0].map((x, i) => a.map(y => y[i]));
}

function getOutputs(brain, inputs) {
   var prevv = inputs;
   for (var i = 1; i < brain.length; i++) {
      prevv = mmultiply(brain[i], prevv);
      for (var sv = 0; sv < prevv.length; sv++) {
         prevv[sv][0] = sigmoid(prevv[sv][0]);
      }
   }
   var mx = prevv[0][0];
   var mxi = 0;
   for (var i = 1; i < 3; i++) {
      var val = prevv[i][0];
      if (val > mx) {
         mx = val;
         mxi = i;
      }
   }
   return mxi;
}

function getDimensions(arr) {
   return (arr[0].length == undefined ? 0 : arr[0].length) + " " + arr.length;
}

function sigmoid(x) {
   return 1 / (1 + Math.exp(-x))
}

function makeArray(w, h, val) {
   var arr = [];
   for (let i = 0; i < h; i++) {
      arr[i] = [];
      for (let j = 0; j < w; j++) {
         arr[i][j] = val;
      }
   }
   return arr;
}
