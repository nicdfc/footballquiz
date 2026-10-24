# ⚽ Badge Quiz

A football badge quiz for the family. Name the club or country from its badge.

- **Easy**: the most famous clubs and countries, with 4 answers to pick from.
- **Medium**: famous teams plus well-known ones from the big European leagues and the A-League.
- **Hard**: smaller clubs and countries, a zoomed-in badge, and wrong answers from the same league.
- **Streak**: keep going until you get one wrong. It gets harder as you go.

Each round has 10 badges and no timer. After every answer you see the full badge and a fun fact.
Players pick a name and emoji, and their best scores are saved in that browser.
Switch **Answer by** to **Typing** to type team names instead. Small spelling mistakes are allowed.

## Playing it

It's a plain static website: `index.html`, `style.css`, `app.js`, `teams.js` and the `logos/` folder.
It is hosted with GitHub Pages: in the repo, go to **Settings → Pages**, choose **Deploy from a branch**,
then pick the branch and the `/ (root)` folder.

## Adding or changing teams

Teams are listed in `teams.js`. Each one has a `level` (1 easy, 2 medium, 3 hard), a `group`
(the league, used for tricky wrong answers), other accepted names and a fun fact.
Its badge must be at `logos/<id>.png`.

For a new national team, add a line to `tools/national-teams.txt` and push. The
**Fetch national team badges** GitHub Action downloads the badge from Wikipedia and commits it.

## Where the badges come from

Badges are trademarks of their clubs and federations. They are used here for a private family quiz.

- European club badges: [luukhopman/football-logos](https://github.com/luukhopman/football-logos)
- A-League badges: [FCLOGO/fclogo.top](https://github.com/FCLOGO/fclogo.top)
- National team badges: English Wikipedia, via `tools/fetch_badges.py`
