import type { UserConfig } from '@commitlint/types'

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'build', 'chore', 'ci', 'docs', 'perf', 'refactor', 'revert', 'style', 'test', 'wip'],
    ],
    'subject-case': [2, 'always', 'sentence-case'],
  },
}

export default config
