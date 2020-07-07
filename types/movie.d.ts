declare interface Movie extends TypedJson {
    movid: string,
    title: string,
    origtitle: string,
    transtitle: string,
    aka: string,
    releasedata: string,
    year: string,
    genres: Href[],
    tags: Href[],
    actors: Href[],
    director: Href | null,
    rating: number,
    posters: string[],
    screenshots: string[],
    covers: string[],
    thumb: string[],
    url: string,

    country: string,
    origlang: string,

    series: Href,

    maker: string,

    label: Href | null,
    provider: Href | null,

    description: string,

    tagline: string,

    duration: string
}