import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Event, InboxItem, KnowledgeItem, Project, Review, Task, TopicPage } from '../../src/shared/pinosV1';

interface PinosV1State {
  inboxItems: InboxItem[];
  knowledgeItems: KnowledgeItem[];
  topicPages: TopicPage[];
  projects: Project[];
  tasks: Task[];
  events: Event[];
  reviews: Review[];
}

function createEmptyState(): PinosV1State {
  return {
    inboxItems: [],
    knowledgeItems: [],
    topicPages: [],
    projects: [],
    tasks: [],
    events: [],
    reviews: []
  };
}

export class PinosV1Store {
  private state: PinosV1State = createEmptyState();
  private readonly dataPath: string;
  private persistChain: Promise<void> = Promise.resolve();

  public constructor(storageRoot: string) {
    this.dataPath = path.join(storageRoot, 'knowledge3', 'pinos-v1-store.json');
  }

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    try {
      const raw = await fs.readFile(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PinosV1State>;
      this.state = {
        inboxItems: parsed.inboxItems ?? [],
        knowledgeItems: parsed.knowledgeItems ?? [],
        topicPages: parsed.topicPages ?? [],
        projects: parsed.projects ?? [],
        tasks: parsed.tasks ?? [],
        events: parsed.events ?? [],
        reviews: parsed.reviews ?? []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.persist();
    }
  }

  public getState(): PinosV1State {
    return {
      inboxItems: [...this.state.inboxItems],
      knowledgeItems: [...this.state.knowledgeItems],
      topicPages: [...this.state.topicPages],
      projects: [...this.state.projects],
      tasks: [...this.state.tasks],
      events: [...this.state.events],
      reviews: [...this.state.reviews]
    };
  }

  public async upsertInboxItem(item: InboxItem): Promise<void> {
    this.upsertById(this.state.inboxItems, item);
    await this.persist();
  }

  public async upsertKnowledgeItem(item: KnowledgeItem): Promise<void> {
    this.upsertById(this.state.knowledgeItems, item);
    await this.persist();
  }

  public async upsertTopicPage(item: TopicPage): Promise<void> {
    this.upsertById(this.state.topicPages, item);
    await this.persist();
  }

  public async upsertProject(item: Project): Promise<void> {
    this.upsertById(this.state.projects, item);
    await this.persist();
  }

  public async upsertTask(item: Task): Promise<void> {
    this.upsertById(this.state.tasks, item);
    await this.persist();
  }

  public async upsertEvent(item: Event): Promise<void> {
    this.upsertById(this.state.events, item);
    await this.persist();
  }

  public async upsertReview(item: Review): Promise<void> {
    this.upsertById(this.state.reviews, item);
    await this.persist();
  }

  private upsertById<T extends { id: string }>(collection: T[], item: T): void {
    const index = collection.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      collection[index] = item;
      return;
    }
    collection.unshift(item);
  }

  private async persist(): Promise<void> {
    this.persistChain = this.persistChain.then(async () => {
      const payload = JSON.stringify(this.state, null, 2);
      await fs.writeFile(this.dataPath, payload, 'utf8');
    });
    await this.persistChain;
  }
}
