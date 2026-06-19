import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PostHogSpanProcessor } from '@posthog/ai/otel';
import { PUBLIC_POSTHOG_PROJECT_TOKEN, PUBLIC_POSTHOG_HOST } from '$env/static/public';

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		'service.name': 'resume-tailor'
	}),
	spanProcessors: [
		new PostHogSpanProcessor({
			projectToken: PUBLIC_POSTHOG_PROJECT_TOKEN,
			host: PUBLIC_POSTHOG_HOST
		})
	]
});

sdk.start();
