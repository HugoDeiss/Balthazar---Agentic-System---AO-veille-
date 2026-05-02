import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { openai as openaiProvider } from '@ai-sdk/openai';
import { generateObject } from 'ai';

const chunkOutputSchema = z.object({
  chunk_title: z.string().describe('Titre court de la règle (max 10 mots)'),
  chunk_type: z.enum([
    'exclusion_rule',
    'disambiguation_rule',
    'sector_definition',
    'conditional_rule',
    'priority_rule',
  ]),
  chunk_content: z.string().describe('Contenu structuré du chunk RAG, 150-300 mots'),
});

export type RAGChunkOutput = z.infer<typeof chunkOutputSchema>;

const SYSTEM_PROMPT = `Tu es un expert en qualification d'appels d'offres pour Balthazar Strategy, cabinet de conseil en stratégie et transformation intervenant auprès de CODIR/COMEX/DG.

Ta mission : générer un chunk RAG de haute qualité à insérer dans le corpus de règles de qualification automatique.

## Format obligatoire du chunk_content

Le chunk doit être structuré ainsi (adapte les sections selon la nature de la règle) :

[Titre de la règle]

[1 phrase : pourquoi cette catégorie pose un problème de qualification]

HORS SCOPE :
- [cas concret 1]
- [cas concret 2]
- [cas concret 3]
Raison : [explication métier courte]

IN SCOPE UNIQUEMENT SI :
- [condition précise qui rend ce type de mission acceptable pour Balthazar]
- [autre condition]

TERME PIÈGE :
[Formulation trompeuse dans un AO] → [ce qu'elle cache réellement, pourquoi elle induit le scoring en erreur]

EXEMPLES D'EXCLUSION :
- "[intitulé typique d'AO hors scope]" → hors scope
- "[autre intitulé]" → hors scope

RÈGLE CLEF : [1 phrase mémorisable résumant la règle de décision]

## Exigences qualité
- Sois précis et discriminant : la règle doit permettre à un LLM de décider seul si un AO est in ou out scope
- Donne des exemples avec des formulations réalistes d'intitulés d'AO
- Ne répète pas les évidences déjà couvertes par le positionnement général de Balthazar (pas de conseil IT, pas de travaux) — concentre-toi sur la nuance spécifique de ce cas
- Si c'est une règle de désambiguïsation : explique ce que le terme peut signifier en contexte in scope vs hors scope
- 150 mots minimum, 350 mots maximum

## Exemple de chunk de référence (niveau attendu)

Règle de désambiguïsation — Mobilité : cas hors périmètre

Ces activités apparaissent dans des AOs de mobilité mais ne correspondent pas au conseil stratégique de Balthazar.

HORS SCOPE :
- Transport scolaire
- Transport de déchets
- Prestation d'exploitation de lignes
- Maîtrise d'œuvre technique sur infrastructure physique
Raison : activités d'exploitation opérationnelle ou d'ingénierie technique — pas de transformation ou plan stratégique.

IN SCOPE UNIQUEMENT SI :
- L'AO porte sur la stratégie de l'organisation exploitant le service (pas l'exploitation elle-même)
- Il existe un enjeu de gouvernance ou de transformation structurante porté par le DG/CODIR

TERME PIÈGE :
"Amélioration de la qualité de service" → peut habiller une enquête de satisfaction opérationnelle ou un suivi de performance sans enjeu stratégique — vérifier si le livrable est une décision CODIR ou juste un rapport de données.

EXEMPLES D'EXCLUSION :
- "DSP exploitation réseau urbain de bus" → hors scope
- "Prestation de transport scolaire" → hors scope
- "Maîtrise d'œuvre ligne tramway" → hors scope

RÈGLE CLEF : Si le prestataire attendu est un opérateur ou un ingénieur (pas un cabinet de conseil), c'est hors scope.`;

export const buildRAGChunk = createTool({
  id: 'buildRAGChunk',
  description: `Génère un chunk RAG structuré de qualité corpus à partir des clarifications utilisateur.
À appeler uniquement quand correction_type=rag_chunk a été décidé par le tuning agent.
Produit un chunk avec titre, type et contenu structuré (150-300 mots) selon le format du corpus Balthazar.`,
  inputSchema: z.object({
    ao_title: z.string().describe("Titre de l'AO concerné"),
    ao_description: z.string().optional().describe("Description courte de l'AO"),
    user_reason: z.string().describe("Raison donnée par l'utilisateur pour la correction"),
    q1_scope: z.string().describe('Portée choisie — quelle catégorie exclure ou inclure'),
    q2_valid_case: z.string().describe('Cas valide à préserver pour éviter les faux négatifs'),
    q3_confirmed_rule: z.string().describe('Reformulation confirmée de la règle'),
    direction: z.enum(['exclude', 'include']).default('exclude'),
    tuning_chunk_title: z.string().optional().describe('Titre proposé par le tuning agent (point de départ)'),
  }),
  outputSchema: chunkOutputSchema,
  execute: async ({ ao_title, ao_description, user_reason, q1_scope, q2_valid_case, q3_confirmed_rule, direction, tuning_chunk_title }) => {
    const userPrompt = `Génère un chunk RAG pour la règle suivante.

AO déclencheur : "${ao_title}"${ao_description ? `\nDescription : ${ao_description}` : ''}

Raison utilisateur : ${user_reason}

Clarifications :
- Portée (Q1) : ${q1_scope}
- Cas valide à préserver (Q2) : ${q2_valid_case}
- Règle confirmée (Q3) : ${q3_confirmed_rule}

Direction : ${direction === 'exclude' ? 'EXCLUSION (faux positif à éviter)' : 'INCLUSION (faux négatif à corriger)'}
${tuning_chunk_title ? `\nTitre suggéré par le diagnostic : "${tuning_chunk_title}"` : ''}

Génère le chunk structuré selon le format du corpus.`;

    const { object } = await generateObject({
      model: openaiProvider('gpt-4o'),
      schema: chunkOutputSchema,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    return object;
  },
});
