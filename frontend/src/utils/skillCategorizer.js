const categoryRules = [
  {
    label: "Web Development",
    patterns: [
      /\bhtml5?\b/i, /\bcss3?\b/i, /sass/i, /scss/i, /less/i, /javascript/i, /\bjs\b/i,
      /typescript/i, /\bts\b/i, /react/i, /redux/i, /next\.?js/i, /node\.?js/i, /\bnode\b/i,
      /express/i, /nest\.?js/i, /angular/i, /vue/i, /nuxt/i, /svelte/i, /astro/i,
      /tailwind/i, /bootstrap/i, /material ui/i, /\bmui\b/i, /chakra/i, /jquery/i,
      /vite/i, /webpack/i, /babel/i, /rest api/i, /\brest\b/i, /graphql/i,
      /api integration/i, /websocket/i, /frontend/i, /backend/i, /full.?stack/i,
      /django/i, /flask/i, /fastapi/i, /spring boot/i, /laravel/i, /asp\.?net/i,
      /ruby on rails/i, /\brails\b/i, /wordpress/i, /web development/i,
    ],
  },
  {
    label: "Programming",
    patterns: [
      /^java$/i, /^python$/i, /^c$/i, /^c\+\+$/i, /^c#$/i, /^go(lang)?$/i, /^rust$/i,
      /^php$/i, /^ruby$/i, /^swift$/i, /^kotlin$/i, /^scala$/i, /^r$/i, /^matlab$/i,
      /^perl$/i, /^dart$/i, /^lua$/i, /^elixir$/i, /^erlang$/i, /^haskell$/i,
      /^clojure$/i, /^f#$/i, /^objective-?c$/i, /^visual basic$/i, /^vb\.?net$/i,
      /^shell scripting$/i, /^bash$/i, /^zsh$/i, /^powershell$/i, /^solidity$/i,
      /^assembly$/i, /^asm$/i, /^groovy$/i, /^delphi$/i, /^fortran$/i, /^cobol$/i,
      /^julia$/i, /^scratch$/i,
    ],
  },
  {
    label: "Mobile Development",
    patterns: [
      /android/i, /\bios\b/i, /react native/i, /flutter/i, /swiftui/i, /xcode/i,
      /android studio/i, /mobile development/i, /mobile app/i, /jetpack compose/i,
      /kotlin multiplatform/i, /cordova/i, /ionic/i,
    ],
  },
  {
    label: "Databases",
    patterns: [
      /mongo/i, /mysql/i, /postgres/i, /sql\b/i, /sqlite/i, /redis/i, /oracle/i,
      /mariadb/i, /cassandra/i, /dynamodb/i, /neo4j/i, /elasticsearch/i, /opensearch/i,
      /database/i, /firebase/i, /firestore/i, /supabase/i, /prisma/i, /mongoose/i,
      /sequelize/i, /typeorm/i, /knex/i, /snowflake/i, /bigquery/i, /redshift/i,
      /data warehouse/i,
    ],
  },
  {
    label: "AI & Data",
    patterns: [
      /machine learning/i, /\bml\b/i, /deep learning/i, /\bai\b/i, /generative ai/i,
      /data science/i, /data analysis/i, /analytics/i, /business intelligence/i, /\bbi\b/i,
      /pandas/i, /numpy/i, /tensorflow/i, /pytorch/i, /keras/i, /scikit/i, /sklearn/i,
      /matplotlib/i, /seaborn/i, /power bi/i, /tableau/i, /excel analytics/i, /nlp/i,
      /computer vision/i, /opencv/i, /hugging face/i, /transformer/i, /llm/i, /rag/i,
      /prompt engineering/i, /statistics/i, /big data/i, /spark/i, /hadoop/i, /etl/i,
      /data engineering/i, /airflow/i, /databricks/i,
    ],
  },
  {
    label: "Cloud & DevOps",
    patterns: [
      /aws/i, /azure/i, /gcp/i, /google cloud/i, /docker/i, /kubernetes/i, /\bk8s\b/i,
      /jenkins/i, /github actions/i, /gitlab ci/i, /ci\/cd/i, /devops/i, /terraform/i,
      /ansible/i, /linux/i, /ubuntu/i, /nginx/i, /apache/i, /vercel/i, /netlify/i,
      /heroku/i, /render/i, /cloudflare/i, /prometheus/i, /grafana/i, /helm/i,
      /serverless/i, /lambda/i, /ec2/i, /s3/i, /cloudfront/i, /firebase hosting/i,
    ],
  },
  {
    label: "Testing & QA",
    patterns: [
      /testing/i, /\bqa\b/i, /quality assurance/i, /selenium/i, /cypress/i, /playwright/i,
      /jest/i, /vitest/i, /mocha/i, /chai/i, /junit/i, /testng/i, /pytest/i, /postman testing/i,
      /manual testing/i, /automation testing/i, /unit testing/i, /integration testing/i,
      /api testing/i, /istqb/i, /bug tracking/i,
    ],
  },
  {
    label: "Design & UI/UX",
    patterns: [
      /ui\/ux/i, /\bui\b/i, /\bux\b/i, /wireframe/i, /prototype/i, /design system/i,
      /user research/i, /canva/i, /figma/i, /adobe xd/i, /photoshop/i, /illustrator/i,
      /framer/i,
    ],
  },
  {
    label: "Tools",
    patterns: [
      /git\b/i, /github/i, /gitlab/i, /bitbucket/i, /postman/i, /swagger/i, /openapi/i,
      /jira/i, /notion/i, /trello/i, /slack/i, /vs\s?code/i, /visual studio/i, /intellij/i,
      /eclipse/i, /pycharm/i, /excel/i, /microsoft office/i,
    ],
  },
  {
    label: "Soft Skills",
    patterns: [
      /communication/i, /leadership/i, /teamwork/i, /problem solving/i, /adaptability/i,
      /collaboration/i, /time management/i, /critical thinking/i, /presentation/i,
      /ownership/i, /creativity/i, /decision making/i, /attention to detail/i,
    ],
  },
];

export function skillsFromCsv(value) {
  return String(value || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

export function categorizeSkills(skills) {
  const grouped = categoryRules.reduce((accumulator, category) => {
    accumulator[category.label] = [];
    return accumulator;
  }, { Other: [] });

  skills.forEach((skill) => {
    const category = categoryRules.find((rule) =>
      rule.patterns.some((pattern) => pattern.test(skill))
    );

    grouped[category?.label || "Other"].push(skill);
  });

  return Object.entries(grouped)
    .filter(([, values]) => values.length)
    .map(([label, values]) => ({ label, skills: [...new Set(values)] }));
}
