import { requireUser } from '../lib/auth.js';

import {
  onlyMethods,
  noStore
} from '../lib/http.js';

import { getCurriculumForField } from '../data/curriculum.js';

import {
  curriculumPercentages,
  evaluateBadges
} from '../lib/stats.js';

export default async function handler(
  req,
  res
) {
  if (
    !onlyMethods(
      req,
      res,
      ['GET']
    )
  ) {
    return;
  }

  noStore(res);

  const user =
    await requireUser(
      req,
      res,
      { paid: true }
    );

  if (!user) return;

  try {
    const curriculum =
      getCurriculumForField(
        user.track
      );

    const percentages =
      await curriculumPercentages(
        user.id,
        curriculum
      );

    const items =
      await evaluateBadges(
        user.id,
        percentages
      );

    return res.status(200).json({
      items
    });

  } catch (err) {
    console.error(
      'Badges error:',
      err
    );

    return res.status(500).json({
      error:
        'Rozetler yüklenemedi.'
    });
  }
}
