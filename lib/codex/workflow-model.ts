import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { WORKFLOW_DESERIALIZE, WORKFLOW_SERIALIZE } from "@workflow/serde";

// A model handle that can cross the workflow step boundary.
//
// Why it exists (spike question 0): WorkflowAgent hands its model to the
// durable model step as a step argument. A string is always resolved with
// `gateway.languageModel()` inside that step (do-stream-step.ts), never with
// the registry, so "codex/gpt-6-luna" would go to the AI Gateway. A provider
// object is serialized with its WORKFLOW_SERIALIZE hook, which keeps only JSON
// config: the custom `fetch` (codexFetch) is dropped and the call would go out
// unauthenticated. So the workflow passes this handle instead: it serializes
// to the registry reference and resolves the real model lazily, in the step,
// from the registry that instrumentation.ts installs as the AI SDK default
// provider.
//
// This file must stay importable inside the workflow sandbox: no server-only,
// no Node built-ins, no imports of the provider itself.

type Registry = { languageModel(id: string): LanguageModelV4 };

function registry(): Registry {
  const provider = globalThis.AI_SDK_DEFAULT_PROVIDER as Registry | undefined;
  if (!provider || typeof provider.languageModel !== "function") {
    throw new Error(
      "The model registry is not installed. instrumentation.ts must call installModelRegistry() at server start.",
    );
  }
  return provider;
}

export class RegistryModel implements LanguageModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly modelId: string;
  readonly provider: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(readonly ref: string) {
    const [provider, ...rest] = ref.split("/");
    this.provider = `${provider}.responses`;
    this.modelId = rest.join("/");
  }

  static [WORKFLOW_SERIALIZE](instance: RegistryModel): { ref: string } {
    return { ref: instance.ref };
  }

  static [WORKFLOW_DESERIALIZE](data: { ref: string }): RegistryModel {
    return new RegistryModel(data.ref);
  }

  private resolve(): LanguageModelV4 {
    return registry().languageModel(this.ref);
  }

  doGenerate(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4GenerateResult> {
    return this.resolve().doGenerate(options);
  }

  doStream(options: LanguageModelV4CallOptions): PromiseLike<LanguageModelV4StreamResult> {
    return this.resolve().doStream(options);
  }
}

/** A workflow-safe model for a registry reference such as "codex/gpt-6-luna". */
export function registryModel(ref: string): RegistryModel {
  return new RegistryModel(ref);
}
