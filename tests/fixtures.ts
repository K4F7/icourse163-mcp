export const NOW_ISO = "2026-09-17T12:00:00+08:00";
export const FUTURE_ISO = "2026-09-24T23:59:59+08:00";
export const PAST_ISO = "2026-09-10T23:59:59+08:00";

export const NOW_MS = Date.parse(NOW_ISO);
export const FUTURE_MS = Date.parse(FUTURE_ISO);
export const PAST_MS = Date.parse(PAST_ISO);

export const MOOC_COURSE = {
  id: 1001,
  name: "大学物理",
  termPanel: { id: 2001 },
  schoolPanel: { shortName: "SJTU" },
};

export const SPOC_COURSE = {
  id: 1002,
  name: "SPOC实验课",
  termPanel: { id: 2002 },
  schoolPanel: { shortName: "SJTU" },
};

export function coursePanelBody(items: unknown[]): string {
  return JSON.stringify({
    code: 0,
    result: { result: items },
  });
}

export const EMPTY_COURSE_PANEL_BODY = coursePanelBody([]);

/** Mixed mocTermDto: open quiz, submitted quiz, past exam, legacy unit. */
export const MIXED_MOC_TERM_DTO = {
  chapters: [
    {
      id: 11,
      name: "第一章",
      homeworks: [
        {
          id: 701,
          name: "第一章作业",
          contentType: 3,
          contentId: 7011,
          test: {
            id: 7011,
            deadline: FUTURE_MS,
            userScore: 0,
            usedTryCount: 0,
          },
        },
      ],
      quizs: [
        {
          id: 301,
          name: "第一章单元测验",
          test: {
            id: 3011,
            deadline: FUTURE_MS,
            userScore: 0,
            testScore: 0,
            usedTryCount: 0,
          },
        },
        {
          id: 302,
          name: "已交的测验",
          test: {
            id: 3021,
            deadline: FUTURE_MS,
            userScore: 0,
            usedTryCount: 2,
          },
        },
        {
          id: 303,
          name: "已批改测验",
          evaluateStatus: "已批改",
          test: {
            deadline: FUTURE_MS,
            userScore: 95,
            usedTryCount: 1,
          },
        },
      ],
      lessons: [
        {
          id: 21,
          units: [
            {
              id: 401,
              name: "旧版单元测验",
              contentType: 5,
              deadline: FUTURE_MS,
              testScore: 0,
              usedTryCount: 0,
            },
            {
              id: 402,
              name: "视频",
              contentType: 1,
              deadline: FUTURE_MS,
            },
          ],
        },
      ],
    },
  ],
  exams: [
    {
      id: 501,
      name: "期末考试",
      endTime: PAST_MS,
      userScore: 0,
      usedTryCount: 0,
    },
    {
      id: 502,
      title: "进行中的考试",
      deadline: FUTURE_MS,
      testScore: 0,
      usedTryCount: 0,
    },
  ],
};

export function mocTermBody(moc: unknown, wrapInMocTermDto = true): string {
  return JSON.stringify({
    code: 0,
    result: wrapInMocTermDto ? { mocTermDto: moc } : moc,
  });
}

export const EMPTY_MOC_TERM_BODY = mocTermBody({ chapters: [], exams: [] });

export const CLOSED_ONLY_MOC_TERM_DTO = {
  chapters: [
    {
      quizs: [
        {
          id: 801,
          name: "已提交作业",
          test: {
            deadline: FUTURE_MS,
            usedTryCount: 1,
            userScore: 0,
          },
        },
      ],
      lessons: [
        {
          units: [
            {
              id: 802,
              name: "过期旧测验",
              contentType: 5,
              deadline: PAST_MS,
              testScore: 0,
            },
          ],
        },
      ],
    },
  ],
  exams: [
    {
      id: 803,
      name: "已结束考试",
      endTime: PAST_MS,
      userScore: 0,
    },
  ],
};


/** Catalog tree: video/doc/quiz/other units + chapter quiz with learn signals. */
export const CATALOG_MOC_TERM_DTO = {
  chapters: [
    {
      id: 11,
      name: "第一章",
      quizs: [
        {
          id: 301,
          name: "第一章单元测验",
          test: {
            id: 3011,
            usedTryCount: 2,
            evaluateStatus: "已批改",
          },
        },
      ],
      lessons: [
        {
          id: 21,
          name: "1.1 绪论",
          units: [
            {
              id: 401,
              name: "导论视频",
              contentType: 1,
              hasLearned: true,
            },
            {
              id: 402,
              name: "课件PDF",
              contentType: 3,
              hasLearned: false,
            },
            {
              id: 403,
              name: "富文本说明",
              contentType: 4,
            },
            {
              id: 404,
              name: "随堂测验",
              contentType: 5,
              usedTryCount: 0,
            },
            {
              id: 405,
              name: "讨论",
              contentType: 6,
            },
          ],
        },
      ],
    },
  ],
  exams: [],
};
