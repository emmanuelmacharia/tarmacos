# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.12.6 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:typography,forms" mcp="ide:claude-code,gemini,vscode+setup:remote" --install pnpm tarmac
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.



## TODO
- [x] npx sv create tarmacos
- [x] configure tailwind
- [x] configure shadcn
- [x] build home page for testing ui out
- [x] make it deploy
- [ ] Add CI/CD
- [ ] Integrate clerk and add auth flow
- [ ] Integrate convex and add DB schema
- [ ] Backend APIs - create Profile
- [ ] Convex add mutation for create profile
