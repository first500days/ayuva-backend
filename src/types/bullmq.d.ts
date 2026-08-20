declare module 'bullmq' {
  export class Queue<T = any> {
    constructor(name: string, opts?: any);
    add(name: string, data: T, opts?: any): Promise<Job<T>>;
    getJob(jobId: string): Promise<Job<T> | undefined | null>;
    upsertJobScheduler(schedulerId: string, everyOrCron: any, job: any): Promise<any>;
    getJobSchedulers(): Promise<Array<{ id?: string; [key: string]: any }>>;
    removeJobScheduler(schedulerId: string): Promise<any>;
    close(): Promise<void>;
  }

  export class Worker<T = any> {
    constructor(name: string, processor: (job: Job<T>) => Promise<any> | any, opts?: any);
    on(event: string, callback: (...args: any[]) => void): this;
    close(): Promise<void>;
  }

  export interface Job<T = any> {
    id?: string;
    name: string;
    data: T;
    opts: any;
    remove(): Promise<void>;
  }
}
