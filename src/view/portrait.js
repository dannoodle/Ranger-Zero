// A sketched face for every ranger, drawn from their name, so the same person always looks the same.
// It uses its own generator seeded by the name and never touches the sim's streams.

var RZ = RZ || {};

(function () {
  var SKIN = ['#e6c4a0', '#d6a77f', '#b9845c', '#94633f', '#6e4a30', '#4f3525'];
  var HAIR = ['#1f1a17', '#3a2a1e', '#5c3f27', '#8a6a3f', '#a8a39a', '#6b2f1e'];

  function faceOf(name) {
    var rng = RZ.makeRng(RZ.hashString(name)).fork('face');
    return {
      skin: rng.pick(SKIN),
      hair: rng.pick(HAIR),
      style: rng.int(0, 5),
      width: rng.range(0.82, 1),
      eyes: rng.range(0.15, 0.22),
      scar: rng.chance(0.3),
      scarSide: rng.chance(0.5) ? 1 : -1,
      scarf: rng.chance(0.45),
      brow: rng.range(-0.05, 0.05)
    };
  }

  // Draws onto a square canvas. state: { hurt: 0..1, dead: bool, taken: bool }
  RZ.drawPortrait = function (canvas, person, coat, state) {
    var ctx = canvas.getContext('2d');
    var s = canvas.width;
    var face = faceOf(person.name);
    state = state || {};
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#1b2428';
    ctx.fillRect(0, 0, s, s);

    // Contour lines behind them, because the map is all they know.
    ctx.strokeStyle = 'rgba(205, 205, 180, 0.13)';
    ctx.lineWidth = 1;
    for (var c = 1; c < 6; c++) {
      ctx.beginPath();
      ctx.ellipse(s * 0.82, s * 0.14, s * 0.2 * c, s * 0.16 * c, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    var cx = s / 2;
    var headY = s * 0.43;
    var headW = s * 0.21 * face.width;
    var headH = s * 0.26;

    // Shoulders
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(s * 0.06, s);
    ctx.quadraticCurveTo(s * 0.12, s * 0.72, cx - s * 0.13, s * 0.68);
    ctx.lineTo(cx + s * 0.13, s * 0.68);
    ctx.quadraticCurveTo(s * 0.88, s * 0.72, s * 0.94, s);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(cx - 1, s * 0.7, 2, s * 0.3);

    if (face.style === 2) {
      // Hood, behind the head
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.ellipse(cx, headY - s * 0.01, headW * 1.42, headH * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (face.style === 1) {
      ctx.fillStyle = face.hair;
      ctx.beginPath();
      ctx.ellipse(cx, headY + s * 0.08, headW * 1.3, headH * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Neck and head
    ctx.fillStyle = face.skin;
    ctx.fillRect(cx - s * 0.08, headY + headH * 0.7, s * 0.16, s * 0.14);
    ctx.beginPath();
    ctx.ellipse(cx, headY, headW, headH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair, on top of the head
    ctx.fillStyle = face.hair;
    if (face.style === 0 || face.style === 1) {
      ctx.beginPath();
      ctx.ellipse(cx, headY - headH * 0.45, headW * 1.03, headH * 0.62, 0, Math.PI, 0);
      ctx.fill();
    } else if (face.style === 3) {
      // Cap with a brim
      ctx.fillStyle = '#39352c';
      ctx.beginPath();
      ctx.ellipse(cx, headY - headH * 0.4, headW * 1.08, headH * 0.66, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - headW * 1.25, headY - headH * 0.44, headW * 2.5, s * 0.03);
    } else if (face.style === 4) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(cx, headY - headH * 0.55, headW * 0.98, headH * 0.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (face.style === 5) {
      // Head wrap
      ctx.fillStyle = '#5b5a4c';
      ctx.beginPath();
      ctx.ellipse(cx, headY - headH * 0.4, headW * 1.1, headH * 0.68, 0, Math.PI, 0);
      ctx.fill();
    }

    // Eyes and brows
    var eyeY = headY - headH * 0.06;
    var eyeX = s * face.eyes * face.width * 0.55;
    ctx.fillStyle = '#14100e';
    if (state.dead) {
      ctx.strokeStyle = '#14100e';
      ctx.lineWidth = Math.max(1, s * 0.014);
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(cx + side * eyeX - s * 0.025, eyeY);
        ctx.lineTo(cx + side * eyeX + s * 0.025, eyeY);
        ctx.stroke();
      });
    } else {
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.arc(cx + side * eyeX, eyeY, s * 0.018, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.strokeStyle = 'rgba(20, 15, 12, 0.75)';
    ctx.lineWidth = Math.max(1, s * 0.016);
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.moveTo(cx + side * (eyeX - s * 0.04), eyeY - s * (0.05 + face.brow));
      ctx.lineTo(cx + side * (eyeX + s * 0.04), eyeY - s * 0.05);
      ctx.stroke();
    });
    // Mouth
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.04, headY + headH * 0.5);
    ctx.lineTo(cx + s * 0.04, headY + headH * 0.5);
    ctx.stroke();

    if (face.scar) {
      ctx.strokeStyle = 'rgba(120, 40, 35, 0.7)';
      ctx.lineWidth = Math.max(1, s * 0.012);
      ctx.beginPath();
      ctx.moveTo(cx + face.scarSide * s * 0.09, headY - headH * 0.35);
      ctx.lineTo(cx + face.scarSide * s * 0.13, headY + headH * 0.25);
      ctx.stroke();
    }
    if (face.scarf) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(cx - s * 0.15, s * 0.66, s * 0.3, s * 0.06);
    }

    if (state.hurt > 0.4) {
      ctx.fillStyle = '#dfd6c2';
      ctx.save();
      ctx.translate(cx, headY - headH * 0.5);
      ctx.rotate(-0.16);
      ctx.fillRect(-headW * 1.1, -s * 0.025, headW * 2.2, s * 0.05);
      ctx.restore();
    }
    if (state.hurt > 0.65) {
      ctx.fillStyle = 'rgba(180, 30, 25, 0.75)';
      ctx.beginPath();
      ctx.arc(cx - s * 0.1, headY - headH * 0.5, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.dead) {
      ctx.fillStyle = 'rgba(10, 12, 14, 0.55)';
      ctx.fillRect(0, 0, s, s);
    }
  };
})();
