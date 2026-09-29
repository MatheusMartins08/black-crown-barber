# Project Instructions

## Project

This is a professional website built for a real or fictional client.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- App Router

## General rules

- Use TypeScript.
- Prefer reusable React components.
- Avoid unnecessarily large components.
- Keep the project structure organized.
- Do not add dependencies unless there is a clear reason.
- Do not remove existing functionality without explicit approval.
- Preserve existing behavior when modifying code.
- Prefer simple solutions over unnecessary abstraction.

## UI

- Design mobile-first.
- The website must be fully responsive.
- Use semantic HTML.
- Prioritize accessibility.
- Use clear visual hierarchy.
- Keep spacing consistent.
- Avoid excessive animations.
- Use accessible color contrast.
- Always consider mobile, tablet and desktop.

## Next.js

- Use App Router.
- Use Server Components by default.
- Use Client Components only when interaction or browser APIs require them.
- Use next/image for images where appropriate.
- Use next/link for internal navigation.
- Configure metadata for SEO.

## Code quality

- Use descriptive names.
- Avoid duplicated logic.
- Keep components focused.
- Prefer readable code over clever code.
- Do not introduce unnecessary design patterns.

## Security

- Never hardcode API keys, passwords, tokens or secrets.
- Never expose private environment variables to client-side code.
- Use environment variables for secrets.
- Never commit .env.local.

## AI behavior

Before implementing a complex feature:

1. Inspect the existing project.
2. Identify the files that need to change.
3. Explain the proposed approach.
4. Identify possible risks.
5. Then implement.

For larger tasks, divide the work into small steps.

After making changes:

1. Explain what changed.
2. List the files modified.
3. Tell me how to test the change.
4. Mention any potential issues.

Do not rewrite unrelated files.

Do not invent APIs, database schemas or external services without telling me.

When something fails, investigate the root cause before attempting a fix.