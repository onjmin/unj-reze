import { Post } from "./types";

export const INITIAL_POSTS: Post[] = [
  {
    id: 1,
    name: "名無しvpS",
    time: "22時間前",
    content: "#お絵描き\nねるネルねるね",
    likes: 25,
    dislikes: 1,
    liked: false,
    disliked: false,
    repliesCount: 8,
    reposts: 2,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58ab6f.png",
    imageAlt: "ねるネルねるねの金髪少女イラスト",
    avatarColor: "from-emerald-500 to-green-600",
    hasCollabButton: true,
    heartsTotal: 1057,
    replies: [
      { id: 101, name: "名無しA", content: "かわいい！", time: "20時間前" }
    ]
  },
  {
    id: 2,
    name: "名無しe8H",
    time: "21時間前",
    content: "#お絵描き\nお絵かきツール 味に使い辛い...",
    likes: 24,
    dislikes: 2,
    liked: false,
    disliked: false,
    repliesCount: 14,
    reposts: 1,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58ab6f.png",
    imageAlt: "味に使い辛いお絵かきツール紹介スケッチ",
    avatarColor: "from-blue-600 to-indigo-700",
    hasCollabButton: true,
    heartsTotal: 840,
    replies: []
  },
  {
    id: 3,
    name: "名無しmpz",
    time: "たった今",
    content: "さとるに限った話ではないけど人間ってある程度歳行くと目つきの攻撃性落ちるよな",
    likes: 3,
    dislikes: 1,
    liked: false,
    disliked: false,
    repliesCount: 8,
    reposts: 2,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58b311.jpg",
    imageAlt: "さとるのビフォーアフター写真",
    avatarColor: "from-indigo-500 to-purple-600",
    hasCollabButton: true,
    heartsTotal: 12,
    replies: [
      {
        id: 102,
        name: "名無しLeuy",
        content: "肌のハリがね... 中学生とかハリが良過ぎな上に反抗期でメンタルも攻撃的だから...",
        time: "2分前"
      }
    ]
  },
  {
    id: 4,
    name: "名無しdbF",
    time: "7時間前",
    content: "#お絵描き\nキョン！風呂に行くわよ！！",
    likes: 2,
    dislikes: 0,
    liked: false,
    disliked: false,
    repliesCount: 26,
    reposts: 0,
    reposted: false,
    hasImage: true,
    imageSrc: "image_58b2e9.png",
    imageAlt: "キョン！風呂に行くわよ！！のラフ画",
    avatarColor: "from-amber-400 to-orange-500",
    hasCollabButton: true,
    heartsTotal: 256,
    replies: []
  },
  {
    id: 5,
    name: "名無し7ui",
    time: "22時間前",
    content: "対立煽りは、無視しよう",
    likes: 8,
    dislikes: 0,
    liked: false,
    disliked: false,
    repliesCount: 23,
    reposts: 1,
    reposted: false,
    avatarColor: "from-blue-400 to-cyan-500",
    heartsTotal: 5,
    replies: []
  }
];
