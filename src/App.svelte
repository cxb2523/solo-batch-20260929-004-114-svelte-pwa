<script>
	import { onMount } from 'svelte';

	export let name;

	let swSupported = 'serviceWorker' in navigator;
	let swStatus = swSupported ? 'registering' : 'unsupported';
	let cacheName = '-';
	let cachedCount = 0;
	let lastFallback = '无';
	let fallbackHit = false;

	function requestStatus() {
		if (navigator.serviceWorker && navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage({ type: 'GET_SW_STATUS' });
		}
	}

	async function updateNow() {
		const reg = await navigator.serviceWorker.getRegistration();
		if (!reg) return;
		if (reg.waiting) {
			reg.waiting.postMessage({ type: 'SKIP_WAITING' });
		}
		await reg.update();
		setTimeout(requestStatus, 500);
	}

	async function clearCaches() {
		if (navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' });
		}
		const keys = await caches.keys();
		await Promise.all(keys.map((key) => caches.delete(key)));
		cachedCount = 0;
		setTimeout(requestStatus, 500);
	}

	onMount(() => {
		if (!swSupported) return;

		navigator.serviceWorker.ready.then(() => {
			swStatus = navigator.serviceWorker.controller ? 'active' : 'registered';
			requestStatus();
		});

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			swStatus = 'active';
			requestStatus();
		});

		navigator.serviceWorker.addEventListener('message', (evt) => {
			const data = evt.data || {};
			if (data.type === 'SW_STATUS') {
				cacheName = data.cacheName;
				cachedCount = data.cachedCount;
				if (data.lastFallback) {
					fallbackHit = true;
					lastFallback = data.lastFallback.url + ' @ ' + data.lastFallback.at;
				}
			}
			if (data.type === 'OFFLINE_FALLBACK') {
				fallbackHit = true;
				lastFallback = data.url + ' @ ' + new Date().toISOString();
			}
		});
	});
</script>

<main>
	<h1>Hello {name}!</h1>
	<p>This is a starter template for a Svelte PWA, based in the <a href="https://github.com/sveltejs/template" target="_blank">Svelte template</a></p>
	<p>You will find the manifest.json file and the service-worker.js file in the public folder</p>
	<p>To update the proper icons for the PWA check <i>/public/images/icons</i></p>

	<section class="offline-panel">
		<h2>离线状态面板</h2>
		<dl>
			<dt>SW 注册状态</dt>
			<dd data-testid="sw-status">{swStatus}</dd>
			<dt>当前缓存名</dt>
			<dd data-testid="cache-name">{cacheName}</dd>
			<dt>已缓存条目数</dt>
			<dd data-testid="cached-count">{cachedCount}</dd>
			<dt>最近一次回退命中</dt>
			<dd data-testid="last-fallback" class:hit={fallbackHit}>{lastFallback}</dd>
		</dl>
		<div class="actions">
			<button on:click={updateNow} disabled={!swSupported}>立即更新</button>
			<button on:click={clearCaches} disabled={!swSupported}>清空缓存</button>
		</div>
	</section>
</main>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	h1 {
		color: #ff3e00;
		text-transform: uppercase;
		font-size: 4em;
		font-weight: 100;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}

	.offline-panel {
		margin: 2em auto 0;
		max-width: 420px;
		text-align: left;
		border: 1px solid #d0d0d0;
		border-radius: 8px;
		padding: 1em 1.5em;
		background: #fafafa;
	}

	.offline-panel h2 {
		font-size: 1.1em;
		margin: 0 0 0.5em;
		color: #2f3ba2;
	}

	.offline-panel dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3em 1em;
		margin: 0 0 1em;
	}

	.offline-panel dt {
		font-weight: 600;
		color: #555;
	}

	.offline-panel dd {
		margin: 0;
		word-break: break-all;
	}

	.offline-panel dd.hit {
		color: #b03a2e;
		font-weight: 600;
	}

	.offline-panel .actions {
		display: flex;
		gap: 0.75em;
	}

	.offline-panel button {
		flex: 1;
		padding: 0.5em 0;
		border: none;
		border-radius: 4px;
		background: #2f3ba2;
		color: #fff;
		cursor: pointer;
	}

	.offline-panel button:disabled {
		background: #aaa;
		cursor: not-allowed;
	}
</style>
