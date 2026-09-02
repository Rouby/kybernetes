// FTL-style outer hull armor plating, radiator fins, and maneuvering thrusters

export function renderShipHull(ctx: CanvasRenderingContext2D): void {
  const now = Date.now() / 1000;

  // Outer Armor Hull Silhouette Path (chamfered sci-fi ship contour around the deck)
  ctx.save();
  ctx.beginPath();
  // Prow / Nose (Bridge side: x=60)
  ctx.moveTo(40, 160);
  ctx.lineTo(20, 200);
  ctx.lineTo(20, 280);
  ctx.lineTo(40, 320);
  ctx.lineTo(40, 70);
  ctx.lineTo(80, 40);
  // Top hull plating line
  ctx.lineTo(1120, 40);
  ctx.lineTo(1160, 70);
  // Engine stern (x=1140-1170)
  ctx.lineTo(1160, 310);
  ctx.lineTo(1185, 330);
  ctx.lineTo(1185, 470);
  ctx.lineTo(1160, 490);
  ctx.lineTo(1160, 730);
  ctx.lineTo(1120, 760);
  // Bottom hull plating line
  ctx.lineTo(80, 760);
  ctx.lineTo(40, 730);
  ctx.closePath();

  // Armor fill with subtle metallic gradient
  const hullGrad = ctx.createLinearGradient(40, 40, 1160, 760);
  hullGrad.addColorStop(0, '#151d2a');
  hullGrad.addColorStop(0.5, '#1b2637');
  hullGrad.addColorStop(1, '#131b26');
  ctx.fillStyle = hullGrad;
  ctx.fill();

  // Heavy outer armor border with beveled highlight
  ctx.strokeStyle = '#2b3c52';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.strokeStyle = '#3e5777';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Armor plate panel lines and rivets
  ctx.strokeStyle = '#0e1520';
  ctx.lineWidth = 2;
  const panelX = [240, 420, 600, 780, 960];
  for (const px of panelX) {
    ctx.beginPath();
    ctx.moveTo(px, 40);
    ctx.lineTo(px, 60);
    ctx.moveTo(px, 740);
    ctx.lineTo(px, 760);
    ctx.stroke();
  }

  // Radiator Cooling Fins on Engineering hull (Top and Bottom near x=860..1080)
  ctx.fillStyle = '#0a0f17';
  ctx.strokeStyle = '#243447';
  ctx.lineWidth = 1.5;
  for (let fx = 860; fx <= 1080; fx += 28) {
    ctx.fillRect(fx, 28, 14, 12);
    ctx.strokeRect(fx, 28, 14, 12);
    ctx.fillRect(fx, 760, 14, 12);
    ctx.strokeRect(fx, 760, 14, 12);
  }

  // Dual Aft Sub-Light Propulsion Thrusters (x=1160..1185)
  const thrusters = [
    { y: 350, h: 40 },
    { y: 410, h: 40 },
  ];

  for (const t of thrusters) {
    // Thruster housing nozzle
    ctx.fillStyle = '#0f1622';
    ctx.strokeStyle = '#364c66';
    ctx.lineWidth = 2;
    ctx.fillRect(1160, t.y, 25, t.h);
    ctx.strokeRect(1160, t.y, 25, t.h);

    // Ion exhaust flame (pulsing cyan-blue plasma plume)
    const plumePulse = 18 + Math.sin(now * 8 + t.y) * 4;
    const plumeGrad = ctx.createLinearGradient(
      1185,
      t.y + t.h / 2,
      1185 + plumePulse,
      t.y + t.h / 2
    );
    plumeGrad.addColorStop(0, 'rgba(0, 229, 255, 0.8)');
    plumeGrad.addColorStop(0.5, 'rgba(0, 150, 255, 0.4)');
    plumeGrad.addColorStop(1, 'rgba(0, 50, 150, 0)');

    ctx.fillStyle = plumeGrad;
    ctx.beginPath();
    ctx.moveTo(1185, t.y + 4);
    ctx.lineTo(1185 + plumePulse, t.y + t.h / 2);
    ctx.lineTo(1185, t.y + t.h - 4);
    ctx.closePath();
    ctx.fill();
  }

  // Forward Bridge Sensor Spire / Antennas (x=15..20, y=240)
  ctx.strokeStyle = '#4a658a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, 240);
  ctx.lineTo(-5, 240);
  ctx.moveTo(20, 220);
  ctx.lineTo(5, 210);
  ctx.moveTo(20, 260);
  ctx.lineTo(5, 270);
  ctx.stroke();

  // Sensor beacon blinker (green LED)
  const beaconAlpha = 0.4 + Math.sin(now * 3) * 0.5;
  ctx.fillStyle = `rgba(0, 255, 102, ${Math.max(0, beaconAlpha)})`;
  ctx.beginPath();
  ctx.arc(-5, 240, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
