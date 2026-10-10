import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Vector2 } from 'three';

// Very subtle screen-space directional blur driven only by camera movement.
// Off by default and imported only after the user enables it.
const MotionBlurShader={
  uniforms:{tDiffuse:{value:null},uDirection:{value:new Vector2(0,0)}},
  vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uDirection; varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv)*0.24;
      c+=texture2D(tDiffuse,vUv-uDirection*1.5)*0.16;
      c+=texture2D(tDiffuse,vUv+uDirection*1.5)*0.16;
      c+=texture2D(tDiffuse,vUv-uDirection*3.0)*0.12;
      c+=texture2D(tDiffuse,vUv+uDirection*3.0)*0.12;
      c+=texture2D(tDiffuse,vUv-uDirection*4.5)*0.10;
      c+=texture2D(tDiffuse,vUv+uDirection*4.5)*0.10;
      gl_FragColor=c;
    }`
};
export function createMotionBlurPass(){
  const pass=new ShaderPass(MotionBlurShader);
  pass.enabled=false;
  const direction=pass.uniforms.uDirection.value;
  return {pass,setVelocity(dx,dy,dz,width,height){
    // Small UV offset; dolly movement also contributes, avoiding extreme smearing.
    const scale=Math.min(1.0,Math.sqrt(dx*dx+dy*dy+dz*dz)*1.7);
    direction.x=THREEClamp(dx/Math.max(width,1)*2.8,-.0018,.0018)*scale;
    direction.y=THREEClamp(-dy/Math.max(height,1)*2.8,-.0018,.0018)*scale;
  }};
}
function THREEClamp(v,min,max){return Math.max(min,Math.min(max,v));}
