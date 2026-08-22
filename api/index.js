import admin from '../handlers/admin.js';
import ai from '../handlers/ai.js';
import alerts from '../handlers/alerts.js';
import archive from '../handlers/archive.js';
import authLogin from '../handlers/auth/login.js';
import authLogout from '../handlers/auth/logout.js';
import authMe from '../handlers/auth/me.js';
import authRegister from '../handlers/auth/register.js';
import badges from '../handlers/badges.js';
import curriculum from '../handlers/curriculum.js';
import dashboard from '../handlers/dashboard.js';
import duels from '../handlers/duels.js';
import exams from '../handlers/exams.js';
import leaderboard from '../handlers/leaderboard.js';
import license from '../handlers/license.js';
import planner from '../handlers/planner.js';
import questions from '../handlers/questions.js';
import resources from '../handlers/resources.js';
import setup from '../handlers/setup.js';
import sleep from '../handlers/sleep.js';
import study from '../handlers/study.js';
import deleteAccount from '../handlers/user/delete-account.js';
import exportData from '../handlers/user/export-data.js';
import profileUpdate from '../handlers/user/profile-update.js';
import profile from '../handlers/user/profile.js';

const ROUTES = new Map([
  ['admin', admin],
  ['ai', ai],
  ['alerts', alerts],
  ['archive', archive],
  ['auth/login', authLogin],
  ['auth/logout', authLogout],
  ['auth/me', authMe],
  ['auth/register', authRegister],
  ['badges', badges],
  ['curriculum', curriculum],
  ['dashboard', dashboard],
  ['duels', duels],
  ['exams', exams],
  ['leaderboard', leaderboard],
  ['license', license],
  ['planner', planner],
  ['questions', questions],
  ['resources', resources],
  ['setup', setup],
  ['sleep', sleep],
  ['study', study],
  ['user/delete-account', deleteAccount],
  ['user/export-data', exportData],
  ['user/profile-update', profileUpdate],
  ['user/profile', profile],
]);

export default async function handler(req, res) {
  const rawRoute = Array.isArray(req.query?.route) ? req.query.route.join('/') : req.query?.route;
  const route = String(rawRoute || '').replace(/^\/+|\/+$/g, '');
  const routeHandler = ROUTES.get(route);

  if (!routeHandler) {
    return res.status(404).json({ error: 'API endpoint bulunamadı.' });
  }

  // "route" yalnızca iç yönlendirme içindir; asıl handler'ların query verisini kirletmesin.
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, 'route')) {
    delete req.query.route;
  }

  return routeHandler(req, res);
}
