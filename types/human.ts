declare interface HumanName {
    value: string,
    type: string,
    hiragana: string,
    engname: string
}

declare interface HumanBio {
    tall: number,
    bust: number,
    cup: string,
    waist: number,
    hip: number,
    shoes: string,
    blood: string
}

declare interface HumanRating {
    looks: number,
    body: number,
    cute: number,
    fappable: number,
    total: number
}

declare interface Human extends TypedJson {
    name: HumanName,
    nicknames: [],
    aliases: HumanName[],
    birthday: string,
    birthplace: string,

    bio: HumanBio,

    photos: string[],
    url: string,

    rating: HumanRating,

    tags: Href[]
}