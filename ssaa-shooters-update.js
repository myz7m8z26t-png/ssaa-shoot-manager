/*
 * Narrabri SSAA Shoot Manager — Shooters Tab Upgrade
 * Adds unique shooter numbers, Left/Right hand, and auto-calculated Group Agg / Grand Agg.
 * Existing scores/results and stored shooter records remain intact.
 * Load this AFTER the app's original inline script:
 *   <script src="./ssaa-shooters-update.js"></script>
 */
(function () {
  'use strict';

  // This is an extension of the existing index.html, not a standalone website.
  if (typeof db === 'undefined' || typeof save !== 'function' || typeof esc !== 'function') {
    console.error('SSAA Shooters upgrade: load this script after the main Shoot Manager script.');
    return;
  }
  const formGrid = document.querySelector('#shooters .card.section-card .grid');
  const tableMount = document.getElementById('shooterTable');
  if (!formGrid || !tableMount) {
    console.error('SSAA Shooters upgrade: Shooters tab was not found.');
    return;
  }
  if (document.getElementById('sShooterNumber')) return; // Do not attach twice.

  function upgradeShooters(data) {
    if (!Array.isArray(data.shooters)) data.shooters = [];
    const numbers = new Set();
    for (const shooter of data.shooters) {
      let number = Number(shooter.shooterNumber);
      if (!Number.isSafeInteger(number) || number < 1 || numbers.has(number)) {
        number = 1;
        while (numbers.has(number)) number++;
      }
      shooter.shooterNumber = number;
      numbers.add(number);
      shooter.handedness = ['Left', 'Right'].includes(shooter.handedness) ? shooter.handedness : '';
    }
    return data;
  }
  function nextShooterNumber() {
    let n = 1;
    while (db.shooters.some(s => s.shooterNumber === n)) n++;
    return n;
  }

  // Ensure imported backup files get upgraded too.
  const originalNormalize = normalize;
  normalize = function (data) {
    return upgradeShooters(originalNormalize(data));
  };
  upgradeShooters(db);
  if (db.shooters.length) save();

  // Extend the original Add Shooter form with the persistent shooter fields.
  formGrid.insertAdjacentHTML('beforeend', `
    <div><label for="sShooterNumber">Shooter Number</label>
      <input id="sShooterNumber" type="number" min="1" step="1" placeholder="Auto-assign next number"></div>
    <div><label for="sHandedness">Shooting Hand</label>
      <select id="sHandedness"><option value="">Not specified</option>
      <option value="Right">Right-handed</option><option value="Left">Left-handed</option></select></div>`);

  // Aggregate results depend on the selected discipline, class and distance.
  // Existing groupAgg() normalises measurements to the site's MOA-style calculation.
  // Grand Agg is the mean of the two standard match-distance Aggs for the same class.
  const controls = document.createElement('div');
  controls.className = 'card section-card';
  controls.innerHTML = `
    <h3>Automatic Group Aggregates</h3>
    <p class="muted small">Agg is calculated from all Group cards at the selected distance. Grand Agg is the average of the completed Aggs at both match distances in the same class. Enter your groups under <b>Group</b>; no manual aggregate entry is needed. A value appears once all required groups are scored.</p>
    <div class="grid">
      <div><label for="shooterAggDiscipline">Discipline</label><select id="shooterAggDiscipline"></select></div>
      <div><label for="shooterAggClass">Group Class</label><select id="shooterAggClass"></select></div>
      <div><label for="shooterAggDistance">Agg Distance</label><select id="shooterAggDistance"></select></div>
    </div>`;
  tableMount.before(controls);
  const aggDiscipline = document.getElementById('shooterAggDiscipline');
  const aggClass = document.getElementById('shooterAggClass');
  const aggDistance = document.getElementById('shooterAggDistance');
  let selectionChangedManually = false;

  function setChoices(select, values, preferred) {
    select.innerHTML = values.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
    select.value = values.includes(preferred) ? preferred : values[0];
  }
  function standardGrandDistances(discipline) {
    return discipline === 'Rimfire' ? ['50 metres', '100 yards'] : ['100 yards', '200 yards'];
  }
  function detectScoredGroup() {
    for (const discipline of ['Rimfire', 'Centrefire']) {
      for (const cls of GROUP_CLASSES[discipline]) {
        for (const distance of GROUP_DISTANCES[discipline]) {
          for (const shooter of db.shooters) {
            const card = db.group[groupKey(discipline, cls, distance, shooter.id)];
            if (card && Array.isArray(card.groups) && card.groups.some(v => v !== null && v !== '')) {
              return { discipline, cls, distance };
            }
          }
        }
      }
    }
    return { discipline: 'Rimfire', cls: GROUP_CLASSES.Rimfire[0], distance: GROUP_DISTANCES.Rimfire[0] };
  }
  function selectGroup(group) {
    setChoices(aggDiscipline, ['Rimfire', 'Centrefire'], group.discipline);
    setChoices(aggClass, GROUP_CLASSES[aggDiscipline.value], group.cls);
    setChoices(aggDistance, GROUP_DISTANCES[aggDiscipline.value], group.distance);
  }
  selectGroup(detectScoredGroup());
  aggDiscipline.addEventListener('change', () => {
    selectionChangedManually = true;
    setChoices(aggClass, GROUP_CLASSES[aggDiscipline.value]);
    setChoices(aggDistance, GROUP_DISTANCES[aggDiscipline.value]);
    renderShooters();
  });
  aggClass.addEventListener('change', () => {
    selectionChangedManually = true;
    renderShooters();
  });
  aggDistance.addEventListener('change', () => {
    selectionChangedManually = true;
    renderShooters();
  });

  const style = document.createElement('style');
  style.textContent = `
    #shooterTable table { min-width: 1100px; }
    #shooterTable .shooter-inline { min-width: 100px; width: 120px; padding: 9px 10px; }
    #shooterTable select.shooter-inline { min-width: 145px; width: 150px; }
    #shooterTable .auto-aggregate { white-space: nowrap; font-variant-numeric: tabular-nums; }
  `;
  document.head.append(style);

  addShooter = function () {
    const name = document.getElementById('sName').value.trim();
    const detailId = document.getElementById('sDetail').value || 'unassigned';
    let bench = Number(document.getElementById('sBench').value);
    const category = document.getElementById('sCategory').value || 'Custom';
    const numberInput = document.getElementById('sShooterNumber').value.trim();
    const shooterNumber = numberInput === '' ? nextShooterNumber() : Number(numberInput);
    const handedness = document.getElementById('sHandedness').value;

    if (!name) return alert('Enter a shooter name.');
    if (!Number.isSafeInteger(shooterNumber) || shooterNumber < 1) return alert('Shooter Number must be a positive whole number.');
    if (db.shooters.some(s => s.shooterNumber === shooterNumber)) return alert('That Shooter Number is already in use.');
    if (detailId === 'unassigned') {
      bench = 0;
    } else {
      if (!bench) bench = nextBench(detailId);
      if (db.shooters.some(s => s.detailId === detailId && Number(s.bench) === bench)) {
        return alert('That bench is already used in this detail.');
      }
    }
    db.shooters.push({
      id: crypto.randomUUID(), name, detailId, bench, category,
      shooterNumber, handedness
    });
    ['sName', 'sBench', 'sShooterNumber'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('sHandedness').value = '';
    save();
    renderAll();
  };

  window.ssaaUpdateShooterNumber = function (id, value) {
    const shooter = db.shooters.find(s => s.id === id);
    if (!shooter) return;
    const n = Number(value);
    if (String(value).trim() === '' || !Number.isSafeInteger(n) || n < 1) {
      alert('Shooter Number must be a positive whole number.');
      renderShooters();
      return;
    }
    if (db.shooters.some(s => s.id !== id && s.shooterNumber === n)) {
      alert('That Shooter Number is already in use.');
      renderShooters();
      return;
    }
    shooter.shooterNumber = n;
    save();
    renderShooters();
  };
  window.ssaaUpdateShooterHand = function (id, value) {
    const shooter = db.shooters.find(s => s.id === id);
    if (!shooter) return;
    shooter.handedness = ['Left', 'Right'].includes(value) ? value : '';
    save();
  };
  function getAggForShooter(shooterId, discipline, cls, distance) {
    const key = groupKey(discipline, cls, distance, shooterId);
    const existing = db.group[key];
    if (!existing || !Array.isArray(existing.groups)) return null;
    return groupAgg(distance, groupCard(discipline, cls, distance, shooterId), db.groupCardsToday);
  }
  function formatAgg(value) {
    return value === null
      ? '<span class="muted small">Pending</span>'
      : '<b class="auto-aggregate">' + value.toFixed(4) + '</b>';
  }

  renderShooters = function () {
    if (!selectionChangedManually) selectGroup(detectScoredGroup());
    const discipline = aggDiscipline.value;
    const cls = aggClass.value;
    const distance = aggDistance.value;
    const grandDistances = standardGrandDistances(discipline);
    if (!db.shooters.length) {
      tableMount.innerHTML = '<div class="empty">No shooters yet.</div>';
      return;
    }
    const rows = db.shooters.slice()
      .sort((a, b) => detailName(a.detailId).localeCompare(detailName(b.detailId)) || a.bench - b.bench)
      .map(shooter => {
        const id = esc(shooter.id);
        const name = esc(shooter.name);
        const categories = CATEGORIES.map(category =>
          '<option' + (category === (shooter.category || 'Custom') ? ' selected' : '') + '>' + esc(category) + '</option>'
        ).join('');
        const agg = getAggForShooter(shooter.id, discipline, cls, distance);
        const grandPieces = grandDistances.map(d => getAggForShooter(shooter.id, discipline, cls, d));
        const grandAgg = grandPieces.every(v => v !== null)
          ? grandPieces.reduce((a, b) => a + b, 0) / grandPieces.length
          : null;
        const hands = [
          '<option value=""' + (!shooter.handedness ? ' selected' : '') + '>Not specified</option>',
          '<option value="Right"' + (shooter.handedness === 'Right' ? ' selected' : '') + '>Right-handed</option>',
          '<option value="Left"' + (shooter.handedness === 'Left' ? ' selected' : '') + '>Left-handed</option>'
        ].join('');
        return '<tr>'
          + '<td><input class="shooter-inline" aria-label="Shooter number for ' + name + '" type="number" min="1" step="1" value="' + esc(shooter.shooterNumber) + '" data-id="' + id + '" onchange="ssaaUpdateShooterNumber(this.dataset.id,this.value)"></td>'
          + '<td>' + esc(detailName(shooter.detailId)) + '</td>'
          + '<td class="bench">' + (shooter.bench || '—') + '</td>'
          + '<td>' + name + '</td>'
          + '<td><select class="shooter-inline" aria-label="Shooting hand for ' + name + '" data-id="' + id + '" onchange="ssaaUpdateShooterHand(this.dataset.id,this.value)">' + hands + '</select></td>'
          + '<td><select class="shooter-inline" aria-label="Category for ' + name + '" data-id="' + id + '" onchange="updateShooterCategory(this.dataset.id,this.value)">' + categories + '</select></td>'
          + '<td>' + formatAgg(agg) + '</td>'
          + '<td>' + formatAgg(grandAgg) + '</td>'
          + '<td><button class="btn-danger" data-id="' + id + '" onclick="removeShooter(this.dataset.id)">Remove</button></td>'
          + '</tr>';
      }).join('');
    tableMount.innerHTML = '<div class="tablewrap"><table><thead><tr>'
      + '<th>Shooter No.</th><th>Detail</th><th>Bench</th><th>Name</th><th>Hand</th><th>Category</th><th>Agg (auto)</th><th>Grand Agg (auto)</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  };

  renderShooters();
})();
