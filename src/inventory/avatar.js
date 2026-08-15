import * as THREE from 'three';

// The little explorer you steer around the box: rust hood, teal tunic,
// pack on the back, and two real hands — whatever each hand holds is
// attached to its anchor so you can see yourself carrying it.
export function buildAvatar() {
  const group = new THREE.Group();

  const tunicMat = new THREE.MeshStandardMaterial({ color: 0x3f7d7a, roughness: 0.8 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0xb5482f, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe9c9a3, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.9 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.85 });

  // face and hands sit on the -z side; the scene rotates the group so -z
  // points along the current facing.
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.15), darkMat);
  bootL.position.set(-0.08, 0.04, -0.02);
  const bootR = bootL.clone();
  bootR.position.x = 0.08;

  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.42, 12), tunicMat);
  tunic.position.y = 0.29;

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.165, 0.06, 12), darkMat);
  belt.position.y = 0.2;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), skinMat);
  head.position.y = 0.62;

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.24, 12), hoodMat);
  hood.position.set(0, 0.74, 0.03);
  hood.rotation.x = 0.18;

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 8, 14), hoodMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.52;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), darkMat);
  eyeL.position.set(-0.05, 0.64, -0.12);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.05;

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.11), packMat);
  pack.position.set(0, 0.42, 0.17);
  const packFlap = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.12), darkMat);
  packFlap.position.set(0, 0.52, 0.17);

  const armGeo = new THREE.CapsuleGeometry(0.045, 0.16, 4, 8);
  const armL = new THREE.Mesh(armGeo, tunicMat);
  armL.position.set(-0.18, 0.38, -0.03);
  armL.rotation.z = 0.25;
  armL.rotation.x = -0.35;
  const armR = armL.clone();
  armR.position.x = 0.18;
  armR.rotation.z = -0.25;

  const handGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const handMeshL = new THREE.Mesh(handGeo, skinMat);
  handMeshL.position.set(-0.21, 0.28, -0.1);
  const handMeshR = handMeshL.clone();
  handMeshR.position.x = 0.21;

  // Anchors that carried items attach to. Note the avatar's own left hand
  // is on its -x side when facing -z (mirrored like looking at a person),
  // but for game readability we bind the LEFT game-hand to the anchor on
  // the screen-left when the avatar faces away (its actual left).
  const handLeft = new THREE.Group();
  handLeft.position.set(-0.24, 0.32, -0.12);
  const handRight = new THREE.Group();
  handRight.position.set(0.24, 0.32, -0.12);

  group.add(
    bootL, bootR, tunic, belt, head, hood, collar, eyeL, eyeR,
    pack, packFlap, armL, armR, handMeshL, handMeshR, handLeft, handRight
  );

  return { group, handLeft, handRight };
}
