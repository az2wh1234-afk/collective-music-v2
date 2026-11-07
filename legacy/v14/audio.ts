import * as Tone from 'tone';
/** Six supplied audio stems; all loop on one shared 27.429s timeline. */
export class PrototypeAudio {
  private players: Tone.Player[] = [];
  private gains: Tone.Gain[] = [];
  private stringsPlayer: Tone.Player | null = null;
  private stringsGain: Tone.Gain | null = null;
  private master: Tone.Gain | null = null;
  private lowpass: Tone.Filter | null = null;
  private speed = 0;
  private started = false;
  private layer = 0;
  private stage = 1;
  private proximity = 0;
  private journeyProgress = 0;
  private arrivalOpen = false;
  private introGain = 0.60;
  private offsetMs = 0;
  private anchorMs: number | null = null;
  private readonly loopSeconds = 27.4293333333;

  async start(layer:number, anchorMs:number|null=null, offsetMs=0) {
    await Tone.start();this.stop();this.layer=layer;this.anchorMs=anchorMs;this.offsetMs=offsetMs;
    this.master = new Tone.Gain(0.85).toDestination();
    this.lowpass = new Tone.Filter({type:"lowpass", frequency:180, rolloff:-24, Q:0.7}).connect(this.master);
    try {
      for(let i=0;i<2;i++)for(let s=1;s<=3;s++){
        const gain=new Tone.Gain(0).connect(this.lowpass!);
        const player=new Tone.Player({url:`/audio/layer${i+1}_stage${s}.m4a`,loop:true,fadeIn:0.03,fadeOut:0.03}).connect(gain);
        this.gains.push(gain);this.players.push(player);
      }
      // Shared strings: a seventh stem, owned by neither participant.
      this.stringsGain = new Tone.Gain(0).connect(this.lowpass!);
      this.stringsPlayer = new Tone.Player({
        url:'/audio/strings_stage3.m4a',loop:true,fadeIn:0.03,fadeOut:0.03
      }).connect(this.stringsGain);
      await Tone.loaded();
      const now=Tone.now()+0.18;
      const phase=this.anchorMs===null?0:Math.max(0,(Date.now()+this.offsetMs+180-this.anchorMs)/1000)%this.loopSeconds;
      this.players.forEach(p=>p.start(now,phase));
      this.stringsPlayer?.start(now,phase);
      this.started=true;this.applyMix();this.updateSpeed(this.speed);
    } catch(e){this.stop();throw e;}
  }
  // Movement opens the low-pass; stopping closes it. Smooth ramps prevent clicks.
  updateSpeed(speed:number){
    this.speed=Math.max(0,Math.min(3,Number.isFinite(speed)?speed:0));
    const t=Math.min(1,this.speed/2);
    const hz=180*Math.pow(14000/180,0.2+0.8*t);
    if(this.lowpass)this.lowpass.frequency.rampTo(this.arrivalOpen || this.proximity>0 ? 14000 : hz,0.5);
  }
  updateJourneyProgress(progress:number){this.journeyProgress=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0));this.applyMix();}
  updateIntroGain(gain:number){
    this.introGain=Math.max(this.introGain,Math.max(0.6,Math.min(1,gain)));
    this.applyMix();
  }
  updateArrivalOpen(open:boolean){this.arrivalOpen=open;this.updateSpeed(this.speed);}
  updateStage(stage:number){this.stage=Math.max(1,Math.min(2,stage));this.applyMix();}
  updateProximity(strength:number){this.proximity=Math.max(0,Math.min(1,strength));this.applyMix();this.updateSpeed(this.speed);}
  // Stage 3 plays when two people are physically close, even away from the destination.
  private applyMix(){if(!this.started)return;
    const together=this.proximity;
    this.gains.forEach((g,i)=>{
      const owner=Math.floor(i/3),stage=i%3+1;
      const local=owner===this.layer;
      // At proximity, both stage-3 files play; otherwise only my stage-1/2 file.
      // Local stages grow from 30% at the start to 100% at the destination.
      // Proximity stage 3 remains balanced between both participants.
      const distanceGain=this.introGain;
      const target=stage===3?together*0.85:local&&stage===this.stage?(1-together)*0.85*distanceGain:0;
      g.gain.rampTo(target,0.7);
    });
    // The common strings enter and leave with stage 3, wherever the meeting occurs.
    this.stringsGain?.gain.rampTo(together*0.85,0.7);
  }
  setSyncOffset(ms:number){this.offsetMs=ms;/* Avoid audible seeks during a loop. New starts use corrected offset. */}
  stop(){try{this.stringsPlayer?.stop();}catch{}this.stringsPlayer?.dispose();this.stringsPlayer=null;this.stringsGain?.dispose();this.stringsGain=null;this.players.forEach(p=>{try{p.stop();}catch{}p.dispose();});this.gains.forEach(g=>g.dispose());this.lowpass?.dispose();this.lowpass=null;this.master?.dispose();this.master=null;this.players=[];this.gains=[];this.started=false;this.introGain=0.60;this.arrivalOpen=false;}
}
