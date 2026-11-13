import { MathUtils, Vector2 } from "three";
import { BODY_LIFT, PUPIL_RANGE, type GopherRig } from "./model";


type Pose = "walk" | "idle" | "sit" | "sleep";

const WALK_YAW: Record<string, number> = {
  walk_down: 0,
  walk_down_right: Math.PI / 4,
  walk_right: Math.PI / 2,
  walk_up_right: (3 * Math.PI) / 4,
  walk_up: Math.PI,
  walk_up_left: (-3 * Math.PI) / 4,
  walk_left: -Math.PI / 2,
  walk_down_left: -Math.PI / 4,
};

const STEP_HZ = 1.8;
const STRIDE = 0.13;
const FOOT_LIFT = 0.07;
const BLEND_RATE = 7; 

function wrapAngle(angle: number): number {
  return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

export class GopherMotion {
  private rig: GopherRig;
  private pose: Pose = "idle";
  private heading: number | null = null; 
  private targetYaw = 0;
  private yaw = 0;
  private time = 0;
  private phase = 0;

  private walk = 0;
  private sit = 0;
  private sleep = 0;

  private nextBlink = 2;
  private blinkUntil = 0;
  private nextLook = 1;
  private lookTarget = new Vector2();
  private look = new Vector2();

  constructor(rig: GopherRig) {
    this.rig = rig;
  }

  setAnimation(name: string) {
    const yaw = WALK_YAW[name];
    if (yaw !== undefined) {
      this.pose = "walk";
      this.targetYaw = this.heading ?? yaw;
      return;
    }
    this.pose = name === "sit" || name === "sleep" ? name : "idle";
    this.targetYaw = 0;
    this.heading = null; 
  }

  setDirection(screenDegrees: number) {
    this.heading = Math.PI / 2 - MathUtils.degToRad(screenDegrees);
    if (this.pose === "walk") {
      this.targetYaw = this.heading;
    }
  }

  update(dt: number) {
    const rig = this.rig;
    this.time += dt;
    const t = this.time;

    this.walk = MathUtils.damp(this.walk, this.pose === "walk" ? 1 : 0, BLEND_RATE, dt);
    const sitting = this.pose === "sit" || this.pose === "sleep";
    this.sit = MathUtils.damp(this.sit, sitting ? 1 : 0, BLEND_RATE * 0.6, dt);
    this.sleep = MathUtils.damp(this.sleep, this.pose === "sleep" ? 1 : 0, BLEND_RATE * 0.4, dt);
    const { walk, sit, sleep } = this;

    this.yaw += wrapAngle(this.targetYaw - this.yaw) * (1 - Math.exp(-10 * dt));
    rig.root.rotation.y = this.yaw;
    const faceYaw = -0.26 * Math.sin(2 * this.yaw);
    rig.face.rotation.y = faceYaw;

    this.phase += dt * Math.PI * 2 * STEP_HZ;
    const swing = Math.sin(this.phase);

    rig.feet.forEach((foot, side) => {
      const phase = this.phase + side * Math.PI;
      const lift = Math.max(0, Math.cos(phase));
      foot.position.z = 0.06 + Math.sin(phase) * STRIDE * walk + 0.2 * sit;
      foot.position.y = lift * FOOT_LIFT * walk + 0.03 * sit;
      foot.rotation.x = -lift * 0.3 * walk - 0.9 * sit;
    });

    rig.arms.forEach((arm, side) => {
      arm.rotation.x = Math.sin(this.phase + side * Math.PI) * 0.5 * walk - 0.35 * sit;
    });

    const breathHz = MathUtils.lerp(0.5, 0.22, sleep);
    const breathSize = MathUtils.lerp(0.012, 0.03, sleep);
    const breath = Math.sin(t * Math.PI * 2 * breathHz) * breathSize;
    rig.body.position.y = BODY_LIFT + Math.abs(swing) * 0.04 * walk - BODY_LIFT * sit;
    rig.body.rotation.z = swing * 0.05 * walk + Math.sin(t * 0.9) * 0.015 * (1 - walk);
    rig.body.rotation.x = 0.04 * walk - 0.08 * sit + 0.2 * sleep;
    rig.body.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);

    if (t >= this.nextBlink) {
      this.blinkUntil = t + 0.12;
      this.nextBlink = t + MathUtils.randFloat(2.5, 6);
    }
    const asleep = sleep > 0.5;
    const blinking = t < this.blinkUntil;
    rig.eyes.forEach((eye) => {
      const facing = Math.cos(this.yaw + faceYaw + Math.atan2(eye.position.x, eye.position.z));
      eye.visible = !asleep && facing > -0.3;
      eye.scale.y = blinking ? 0.1 : 1;
    });
    rig.closedEyes.forEach((closed) => {
      closed.visible = asleep;
    });


    if (this.pose === "walk") {
      this.lookTarget.set(0, 0);
    } else if (t >= this.nextLook) {
      this.nextLook = t + MathUtils.randFloat(1.5, 4);
      if (Math.random() < 0.4) {
        this.lookTarget.set(0, 0);
      } else {
        this.lookTarget.set(MathUtils.randFloat(-0.8, 0.8), MathUtils.randFloat(-0.5, 0.7));
      }
    }
    this.look.x = MathUtils.damp(this.look.x, this.lookTarget.x, 12, dt);
    this.look.y = MathUtils.damp(this.look.y, this.lookTarget.y, 12, dt);
    const gaze = new Vector2(Math.sin(this.yaw) * 0.8 + this.look.x, this.look.y);
    if (gaze.length() > 1) {
      gaze.normalize();
    }
    rig.pupils.forEach((pupil) => {
      pupil.position.x = gaze.x * PUPIL_RANGE;
      pupil.position.y = gaze.y * PUPIL_RANGE;
    });
  }
}
