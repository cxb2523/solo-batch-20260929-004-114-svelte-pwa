import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';

const production = !process.env.ROLLUP_WATCH;

// Injects a build-scoped version into public/service-worker.js so the
// runtime cache name always matches this exact build output.
function serviceWorkerVersion() {
	return {
		name: 'service-worker-version',
		writeBundle() {
			const fs = require('fs');
			const path = require('path');
			const pkg = require('./package.json');
			const now = new Date();
			const pad = (n) => String(n).padStart(2, '0');
			const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
			const version = `v${pkg.version}-${stamp}`;
			const swPath = path.resolve(__dirname, 'public/service-worker.js');
			const source = fs.readFileSync(swPath, 'utf8');
			const updated = source.replace(
				/const SW_VERSION = '[^']*';/,
				`const SW_VERSION = '${version}';`
			);
			if (updated === source) {
				throw new Error('service-worker.js: SW_VERSION declaration not found');
			}
			fs.writeFileSync(swPath, updated);
			console.log(`[service-worker-version] injected SW_VERSION=${version}`);
		}
	};
}

export default {
	input: 'src/main.js',
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file: 'public/build/bundle.js'
	},
	plugins: [
		svelte({
			// enable run-time checks when not in production
			dev: !production,
		// we'll extract any component CSS out into
		// a separate file - better for performance
		css: css => {
			// css.write() resolves relative to the bundle output dir
			// (public/build), so this emits public/build/bundle.css.
			css.write('bundle.css');
		}
		}),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration -
		// consult the documentation for details:
		// https://github.com/rollup/plugins/tree/master/packages/commonjs
		resolve({
			browser: true,
			dedupe: ['svelte']
		}),
		commonjs(),

		// In dev mode, call `npm run start` once
		// the bundle has been generated
		!production && serve(),

		// Watch the `public` directory and refresh the
		// browser on changes when not in production
		!production && livereload('public'),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		production && terser(),

		// Stamp the service worker with this build's version
		serviceWorkerVersion()
	],
	watch: {
		clearScreen: false
	}
};

function serve() {
	let started = false;

	return {
		writeBundle() {
			if (!started) {
				started = true;

				require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
					stdio: ['ignore', 'inherit', 'inherit'],
					shell: true
				});
			}
		}
	};
}
