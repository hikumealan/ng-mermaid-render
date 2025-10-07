import { Injectable, signal } from '@angular/core';

declare const PubNub: any;

export interface User {
  uuid: string;
  name: string;
  initials: string;
  color: string;
}

const ADJECTIVES = ['Agile', 'Brave', 'Clever', 'Daring', 'Eager', 'Fancy', 'Giant', 'Happy', 'Jolly', 'Keen'];
const NOUNS = ['Aardvark', 'Bear', 'Cat', 'Dog', 'Eagle', 'Fox', 'Giraffe', 'Hippo', 'Jaguar', 'Koala'];
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7B801', '#5F4B8B', '#FAD02C', '#FF9F1C', '#83D475', '#E55934', '#00A8E8'];

@Injectable()
export class CollaborationService {
  private pubnub: any;
  private channel: string = '';
  private localUser!: User;

  users = signal<User[]>([]);

  constructor() {
    // Defer user creation to initialize() to ensure PubNub is loaded.
  }

  initialize(session: string, remoteUpdateCallback: (code: string) => void) {
    if (typeof PubNub === 'undefined') {
      console.error('PubNub SDK not loaded. Collaboration features disabled.');
      return;
    }
    
    // Create the local user now that we've confirmed the SDK is available.
    this.localUser = this.createRandomUser();
    this.channel = `mermaid-studio-${session}`;

    this.pubnub = new PubNub({
      publishKey: 'pub-c-41c4356c-01b3-4533-873c-e87a2290f62c',
      subscribeKey: 'sub-c-132d56d2-2884-11e7-9524-02ee2ddab7fe',
      uuid: this.localUser.uuid,
    });

    const listener = {
      status: (statusEvent: any) => {
        if (statusEvent.category === 'PNConnectedCategory') {
          // Connected, now we can get presence
          this.pubnub.hereNow({ channels: [this.channel], includeUUIDs: true, includeState: true },
            (_status: any, response: any) => {
              this.updateUsersFromHereNow(response.channels[this.channel].occupants);
            }
          );
        }
      },
      message: (messageEvent: any) => {
        // Handle incoming code updates from other users
        if (messageEvent.publisher !== this.localUser.uuid) {
          remoteUpdateCallback(messageEvent.message.code);
        }
      },
      presence: (presenceEvent: any) => {
        // Handle users joining or leaving
        if (presenceEvent.action === 'join') {
          this.users.update(currentUsers => [...currentUsers, this.createUserFromState(presenceEvent)]);
        } else if (presenceEvent.action === 'leave' || presenceEvent.action === 'timeout') {
          this.users.update(currentUsers => currentUsers.filter(user => user.uuid !== presenceEvent.uuid));
        } else if (presenceEvent.action === 'state-change') {
            this.users.update(currentUsers => currentUsers.map(user => 
                user.uuid === presenceEvent.uuid ? this.createUserFromState(presenceEvent) : user
            ));
        }
      },
    };

    this.pubnub.addListener(listener);

    this.pubnub.subscribe({
      channels: [this.channel],
      withPresence: true,
    });

    this.pubnub.setState({
        channels: [this.channel],
        state: { name: this.localUser.name, color: this.localUser.color }
    });
  }

  publishCode(code: string) {
    if (!this.pubnub) return;

    this.pubnub.publish({
      channel: this.channel,
      message: { code: code },
    });
  }

  private createRandomUser(): User {
    const uuid = PubNub.generateUUID();
    const name = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
    const initials = name.split(' ').map(n => n[0]).join('');
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return { uuid, name, initials, color };
  }

  private createUserFromState(presenceEvent: any): User {
    const name = presenceEvent.state?.name || 'Anonymous';
    const initials = name.split(' ').map((n: string) => n[0]).join('');
    const color = presenceEvent.state?.color || '#cccccc';
    return { uuid: presenceEvent.uuid, name, initials, color };
  }
  
  private updateUsersFromHereNow(occupants: any[]) {
      const presentUsers = occupants.map(occ => this.createUserFromState(occ));
      this.users.set(presentUsers);
  }
}