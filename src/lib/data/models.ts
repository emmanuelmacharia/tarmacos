export type Model = {
	provider: string | null;
	name: string | null;
	id: string | null;
};

export type ModelConfig = {
	config: {
		search: boolean;
		reasoning: boolean;
		reasoningEffort: 'High' | 'Medium' | 'Low' | 'None';
	};
};

type Provider = {
	name: string;
	slug: string;
	privacy_policy_url: string | null;
	terms_of_service_url: string | null;
	status_page_url?: string | null;
};

export type SelectedModel = Model & ModelConfig;

export type AIModel = {
	id: string;
	canonical_slug: string;
	hugging_face_id: string | null;
	name: string;
	created: number;
	description: string;
	context_length: number;
	architecture: {
		modality: string;
		input_modalities: string[];
		output_modalities: string[];
		tokenizer: string;
		instruct_type: string | null;
	};
	pricing: {
		// https://openrouter.ai/docs/guides/overview/models#pricing-object
		prompt: string;
		completion: string;
		request?: string;
		image?: string;
		web_search?: string;
		internal_reasoning?: string;
		input_cache_read?: string;
		input_cache_write?: string;
	};
	top_provider: {
		// https://openrouter.ai/docs/guides/overview/models#top-provider-object
		context_length: number | null;
		max_completion_tokens: number | null;
		is_moderated: boolean;
	};
	per_request_limits: null;
	supported_parameters: string[]; // https://openrouter.ai/docs/guides/overview/models#supported-parameters
	default_parameters: {
		temperature?: number | null;
		top_p?: number | null;
		top_k?: number | null;
		frequency_penalty?: number | null;
		presence_penalty?: number | null;
		repetition_penalty?: number | null;
	} | null;
	expiration_date: string | null;
};

export type ModelsAndProviders = {
	name: string;
	slug: string;
	privacy_policy_url: string | null;
	terms_of_service_url: string | null;
	status_page_url?: string | null;
	models: AIModel[];
};

export interface Props {
	providers: Provider[];
	models: AIModel[];
	modelSelections: Record<Role, SelectedModel>;
}

export type Role = 'writer' | 'reviewer';
