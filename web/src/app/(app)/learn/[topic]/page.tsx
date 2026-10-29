import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TopicView } from "@/components/learn/topic-view";
import { findTopic } from "@/lib/penny/answers";
import { learnTopicPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/learn/[topic]">): Promise<Metadata> {
  const topic = findTopic((await params).topic);
  return { title: topic ? `${topic.label} | CENSE` : "Learn | CENSE" };
}

export default async function TopicPage({ params }: PageProps<"/learn/[topic]">) {
  const { topic: slug } = await params;
  await requireStudent(learnTopicPath(slug));
  const topic = findTopic(slug);
  if (!topic) notFound();
  return <TopicView topic={topic} />;
}
