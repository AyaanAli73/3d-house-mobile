import { Sky } from 'three/addons/objects/Sky.js';

const PRESETS = {
  sunrise: {sun:[-15,4.2,-30], sunColor:'#ffb56f', sunPower:1.42, hemi:'#ead6c2', ground:'#343b2a', hemiPower:.72, ambient:.11, fill:'#b9c8d5', fillPower:.26, rim:'#e7a67e', rimPower:.38, exposure:.86, fog:'#c9c2b5', turbidity:9, rayleigh:2.55, mie:.008, mieG:.82},
  morning: {sun:[-18,19,-30], sunColor:'#ffe0b0', sunPower:2.0, hemi:'#e1efff', ground:'#3d5035', hemiPower:.82, ambient:.11, fill:'#c8e4ff', fillPower:.36, rim:'#fff0d8', rimPower:.30, exposure:.89, fog:'#b9cbc6', turbidity:7.8, rayleigh:2.05, mie:.005, mieG:.82},
  noon: {sun:[-8,45,-14], sunColor:'#fff4da', sunPower:2.9, hemi:'#e9f4ff', ground:'#62674b', hemiPower:1.0, ambient:.19, fill:'#dcecff', fillPower:.40, rim:'#ffffff', rimPower:.25, exposure:.90, fog:'#cbdde2', turbidity:6.2, rayleigh:1.8, mie:.004, mieG:.78},
  golden: {sun:[-19,8.5,-30], sunColor:'#ffb45f', sunPower:2.35, hemi:'#f1d5ba', ground:'#4b4c34', hemiPower:.82, ambient:.14, fill:'#9ab3d0', fillPower:.40, rim:'#ffce8b', rimPower:.72, exposure:1.0, fog:'#cfbca6', turbidity:10, rayleigh:2.35, mie:.012, mieG:.84},
  sunset: {sun:[12,4.5,-28], sunColor:'#ff875f', sunPower:1.35, hemi:'#e6ad95', ground:'#36392f', hemiPower:.57, ambient:.11, fill:'#849bc8', fillPower:.42, rim:'#ff936e', rimPower:.70, exposure:.99, fog:'#c8a99e', turbidity:12, rayleigh:2.6, mie:.015, mieG:.85},
  blue: {sun:[12,-2,-28], sunColor:'#b5caff', sunPower:.16, hemi:'#91aee6', ground:'#202b3d', hemiPower:.50, ambient:.16, fill:'#6989d7', fillPower:.62, rim:'#9bb8ff', rimPower:.40, exposure:.82, fog:'#7c98b0', turbidity:13, rayleigh:2.7, mie:.018, mieG:.85},
  night: {sun:[-12,-8,8], sunColor:'#9fbfff', sunPower:.025, hemi:'#819aca', ground:'#111d20', hemiPower:.39, ambient:.20, fill:'#637fb3', fillPower:.42, rim:'#7a9dc8', rimPower:.22, exposure:.74, fog:'#34485a', turbidity:16, rayleigh:1.0, mie:.025, mieG:.85}
};

export function createTimeOfDayController({THREE,scene,sky,sun,sunDisc=null,sunGlow=null,hemi,ambient,fill,rimLight,renderer,river}) {
  const scratch = new THREE.Vector3();
  function set(key) {
    const p=PRESETS[key]||PRESETS.morning;
    sun.position.set(...p.sun);sun.color.set(p.sunColor);sun.intensity=p.sunPower;
    hemi.color.set(p.hemi);hemi.groundColor.set(p.ground);hemi.intensity=p.hemiPower;
    ambient.intensity=p.ambient;fill.color.set(p.fill);fill.intensity=p.fillPower;rimLight.color.set(p.rim);rimLight.intensity=p.rimPower;
    renderer.toneMappingExposure=p.exposure;
    scene.fog.color.set(p.fog);
    sky.material.uniforms['turbidity'].value=p.turbidity;
    sky.material.uniforms['rayleigh'].value=p.rayleigh;
    sky.material.uniforms['mieCoefficient'].value=p.mie;
    sky.material.uniforms['mieDirectionalG'].value=p.mieG;
    sky.material.uniforms['sunPosition'].value.copy(sun.position);
    const sunDirection=scratch.copy(sun.position).normalize();
    if(sunDisc){sunDisc.position.copy(sunDirection).multiplyScalar(104);sunDisc.visible=p.sun[1]>0.5;}
    if(sunGlow){sunGlow.position.copy(sunDirection).multiplyScalar(102);sunGlow.visible=p.sun[1]>0.5;}
    if(river?.material?.uniforms?.sunDirection)river.material.uniforms.sunDirection.value.copy(sunDirection);
    if(river?.material?.uniforms?.sunColor)river.material.uniforms.sunColor.value.copy(sun.color);
    // A soft exposure compensation keeps dawn and night readable without flattening their contrast.
    renderer.toneMappingExposure=p.exposure;
    return key;
  }
  return {set, keys:Object.keys(PRESETS)};
}
