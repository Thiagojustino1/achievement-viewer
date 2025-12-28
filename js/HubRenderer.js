import { detectRepo, resolveRootRepo, fetchAllForks, fetchJSON } from './utils.js';

async function loadGameData(person) {
  const url = `https://raw.githubusercontent.com/${person.login}/${person.repo || 'achievement-viewer'}/user/game-data.json`;
  const data = await fetchJSON(url);

  if (!data) {
    person.gameData = [];
    person.achievements = 0;
    person.totalGames = 0;
    person.perfectGames = 0;
    person.totalAchievements = 0;
    return person;
  }

  let earnedAchievements = 0;
  let totalAchievements = 0;
  let perfect = 0;

  for (const g of data) {
    // IMPORTANT: The blacklist has already been applied during game-data.json generation
    // by GameLoader.js. The achievements in g.achievements are already filtered.
    // We should NOT try to re-apply the blacklist here.
    
    // However, we need to determine the TOTAL count of achievements for this game.
    // We have two sources:
    // 1. g.info.achievements - the full schema (if available)
    // 2. g.achievements - the user's save data
    
    const blacklist = g.info?.blacklist || [];
    
    // Check if we have a full schema in game-info
    const hasFullSchema = g.info && 
                         g.info.achievements && 
                         Object.keys(g.info.achievements).length > 0;
    
    let totalCount = 0;
    let earnedCount = 0;
    let canDeterminePerfect = false;
    
    if (hasFullSchema) {
      // We have the full achievement schema from game-info.json
      // Count the total AFTER applying blacklist (since schema has everything)
      const schemaKeys = Object.keys(g.info.achievements);
      const validSchemaKeys = schemaKeys.filter(key => !blacklist.includes(key));
      totalCount = validSchemaKeys.length;
      
      // Count how many of these are actually earned in the save data
      for (const key of validSchemaKeys) {
        const userAch = g.achievements[key];
        if (userAch && (userAch.earned === true || userAch.earned === 1)) {
          earnedCount++;
        }
      }
      
      canDeterminePerfect = true;
    } else {
      // No full schema available
      // The user's save file might only contain unlocked achievements
      // We can count achievements but can't reliably determine if it's perfect
      const saveKeys = Object.keys(g.achievements);
      totalCount = saveKeys.length;
      
      for (const key of saveKeys) {
        const userAch = g.achievements[key];
        if (userAch && (userAch.earned === true || userAch.earned === 1)) {
          earnedCount++;
        }
      }
      
      // CRITICAL FIX: If save file only has unlocked achievements,
      // we can't determine if it's a perfect game
      canDeterminePerfect = false;
    }
    
    earnedAchievements += earnedCount;
    totalAchievements += totalCount;
    
    // Only count as perfect if:
    // 1. We have the full schema (canDeterminePerfect = true)
    // 2. There are achievements to earn (totalCount > 0)
    // 3. All valid achievements are earned (earnedCount === totalCount)
    if (canDeterminePerfect && totalCount > 0 && earnedCount === totalCount) {
      perfect++;
    }
  }

  person.gameData = data;
  person.achievements = earnedAchievements;
  person.totalGames = data.length;
  person.perfectGames = perfect;
  person.totalAchievements = totalAchievements;
  return person;
}

async function addUserToGrid(person) {
  const grid = document.getElementById('grid');

  const card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = `${grid.children.length * 0.03}s`;
  card.innerHTML = `
    <img class="avatar" src="${person.avatar}">
    <div class="username">${person.login}${person.original ? ' ⭐' : ''}</div>
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width:0%">
          <span>0%</span>
        </div>
      </div>
    </div>
    <div class="stats">Loading…</div>
  `;
  grid.appendChild(card);

  await loadGameData(person);

  const perc = person.totalAchievements ? Math.round((person.achievements / person.totalAchievements) * 100) : 0;

  card.querySelector('.progress-fill').style.width = perc + '%';
  card.querySelector('.progress-fill span').textContent = perc + '%';
  card.querySelector('.stats').innerHTML = `
    ${person.achievements} achievements<br>
    ${person.perfectGames} / ${person.totalGames} perfect games
  `;

  card.addEventListener('mousedown', (e) => {
    const url = `https://${person.login}.github.io/${person.repo || 'achievement-viewer'}/`;
    if (e.button === 0 || e.button === 1) {
      if (e.button === 1) e.preventDefault();
      window.open(url, '_blank');
    }
  });
  
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

(async () => {
  const current = detectRepo();
  if (!current) return;

  const root = await resolveRootRepo(current.owner, current.repo);

  // Main repo user
  const mainUser = {
    login: root.owner,
    avatar: `https://github.com/${root.owner}.png`,
    original: true,
    repo: root.repo,
  };
  addUserToGrid(mainUser);

  // Fetch forks (USES SHARED CACHE NOW)
  const forks = await fetchAllForks(root.owner, root.repo);
  
  for (const f of forks) {
    addUserToGrid({
      login: f.owner.login,
      avatar: `https://github.com/${f.owner.login}.png`,
      original: false,
      repo: f.name,
    });
  }

  // Search & sort
  const people = [
    mainUser,
    ...forks.map((f) => ({
      login: f.owner.login,
      avatar: `https://github.com/${f.owner.login}.png`,
      original: false,
      repo: f.name,
    })),
  ];

  document.getElementById('search').addEventListener('input', () => renderFiltered(people));
  document.getElementById('sort').addEventListener('change', () => renderFiltered(people));

  function renderFiltered(users) {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const sortMode = document.getElementById('sort').value;

    let filtered = users.filter((u) => u.login.toLowerCase().includes(searchTerm));

    if (sortMode === 'az') filtered.sort((a, b) => a.login.localeCompare(b.login));
    if (sortMode === 'za') filtered.sort((a, b) => b.login.localeCompare(a.login));
    if (sortMode === 'mostAch') filtered.sort((a, b) => b.achievements - a.achievements);
    if (sortMode === 'mostPerfect') filtered.sort((a, b) => b.perfectGames - a.perfectGames);

    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    filtered.forEach(addUserToGrid);
  }
})();
