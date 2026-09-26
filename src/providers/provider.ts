export interface ReviewProvider {
  review(input: {
    system: string;
    context: string;
  }): Promise<string>;
}
