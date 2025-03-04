import { Icon } from '@expo/vector-icons/build/FontAwesome';

export type TabParamList = {
  index: undefined;
  modules: undefined;
  resources: undefined;
  courses: undefined;
  spotter: undefined;
  video: undefined;
};

export type TabRouteConfig = {
  name: keyof TabParamList;
  title: string;
  icon: keyof typeof Icon.glyphMap;
};
